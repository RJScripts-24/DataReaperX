from __future__ import annotations

import base64
from email.mime.text import MIMEText

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from datareaper.core.logging import get_logger

logger = get_logger(__name__)


class GmailAPIClient:
	def __init__(self, settings) -> None:
		creds = Credentials(
			token=None,
			refresh_token=settings.gmail_refresh_token,
			client_id=settings.gmail_client_id,
			client_secret=settings.gmail_client_secret,
			token_uri="https://oauth2.googleapis.com/token",
		)
		self._service = build("gmail", "v1", credentials=creds, cache_discovery=False)
		self._sender = settings.gmail_sender_email

	def _execute_send(
		self,
		payload: dict,
		to: str,
		subject: str,
		thread_id: str | None,
		in_reply_to_message_id: str | None,
	) -> dict:
		try:
			return (
				self._service.users()
				.messages()
				.send(userId="me", body=payload)
				.execute()
			)
		except HttpError as exc:
			message = str(exc)
			if thread_id and "Invalid thread_id value" in message:
				logger.warning(
					"gmail_send_invalid_thread_id_retrying_without_thread",
					to=to,
					subject=subject,
					thread_id=thread_id,
				)
				fallback_payload = {"raw": payload["raw"]}
				if in_reply_to_message_id:
					logger.warning(
						"gmail_send_retrying_with_reply_headers_only",
						to=to,
						subject=subject,
						thread_id=thread_id,
						in_reply_to_message_id=in_reply_to_message_id,
					)
				return (
					self._service.users()
					.messages()
					.send(userId="me", body=fallback_payload)
					.execute()
				)
			raise

	def send_message(
		self,
		to: str,
		subject: str,
		body: str,
		thread_id: str | None = None,
		in_reply_to_message_id: str | None = None,
	) -> dict:
		msg = MIMEText(body)
		msg["to"] = to
		msg["from"] = self._sender
		msg["subject"] = subject
		if in_reply_to_message_id:
			msg["In-Reply-To"] = in_reply_to_message_id
			msg["References"] = in_reply_to_message_id

		raw = base64.urlsafe_b64encode(msg.as_bytes()).decode("utf-8")
		payload: dict = {"raw": raw}
		if thread_id:
			payload["threadId"] = thread_id

		result = self._execute_send(
			payload=payload,
			to=to,
			subject=subject,
			thread_id=thread_id,
			in_reply_to_message_id=in_reply_to_message_id,
		)
		return {
			"message_id": result.get("id"),
			"thread_id": result.get("threadId"),
		}

	def list_threads(self, query: str = "is:inbox", max_results: int = 20) -> list[dict]:
		request = self._service.users().threads().list(
			userId="me",
			q=query,
			maxResults=max_results,
		)
		try:
			response = request.execute()
		except HttpError as exc:
			message = str(exc)
			if "Metadata scope does not support 'q' parameter" not in message:
				raise
			# Some Gmail OAuth contexts reject search query usage even when auth succeeds.
			# Fall back to listing recent threads without query filtering.
			response = (
				self._service.users()
				.threads()
				.list(userId="me", maxResults=max_results)
				.execute()
			)
		return response.get("threads", [])

	def get_thread_messages(self, thread_id: str) -> list[dict]:
		try:
			response = (
				self._service.users()
				.threads()
				.get(userId="me", id=thread_id, format="full")
				.execute()
			)
		except HttpError as exc:
			if "Metadata scope doesn't allow format FULL" not in str(exc):
				raise
			response = (
				self._service.users()
				.threads()
				.get(
					userId="me",
					id=thread_id,
					format="metadata",
					metadataHeaders=["From", "Subject", "Date"],
				)
				.execute()
			)
		messages = response.get("messages", [])

		parsed_messages: list[dict] = []
		for message in messages:
			payload = message.get("payload", {})
			headers = payload.get("headers", [])
			header_map = {h.get("name", ""): h.get("value", "") for h in headers}

			body_data = payload.get("body", {}).get("data")
			if not body_data:
				parts = payload.get("parts", [])
				for part in parts:
					body_data = part.get("body", {}).get("data")
					if body_data:
						break

			decoded_body = ""
			if body_data:
				try:
					decoded_body = base64.urlsafe_b64decode(body_data + "===").decode(
						"utf-8", errors="ignore"
					)
				except Exception as exc:  # pragma: no cover - malformed payload edge cases
					logger.warning("gmail_message_decode_failed", thread_id=thread_id, error=str(exc))
			if not decoded_body:
				decoded_body = header_map.get("Subject", "")

			parsed_messages.append(
				{
					"message_id": message.get("id"),
					"thread_id": message.get("threadId"),
					"rfc_message_id": header_map.get("Message-Id") or header_map.get("Message-ID", ""),
					"from": header_map.get("From", ""),
					"subject": header_map.get("Subject", ""),
					"date": header_map.get("Date", ""),
					"body": decoded_body,
				}
			)

		return parsed_messages

	def get_new_messages_since(self, last_history_id: str) -> list[dict]:
		response = (
			self._service.users()
			.history()
			.list(userId="me", startHistoryId=last_history_id, historyTypes=["messageAdded"])
			.execute()
		)
		return response.get("history", [])


__all__ = ["GmailAPIClient"]
