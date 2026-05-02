from __future__ import annotations

import base64
import re
from pathlib import Path

from datareaper.core.logging import get_logger

logger = get_logger(__name__)


FORM_URL_PATTERN = re.compile(
    r'https?://[^\s"\'<>]+(?:optout|opt-out|removal|remove|delete|privacy|form)[^\s"\'<>]*',
    re.IGNORECASE,
)

ATTACHMENT_EXTENSIONS = {".pdf", ".doc", ".docx", ".png", ".jpg", ".jpeg"}


def extract_form_url(email_body: str) -> str | None:
    """Extract the first opt-out/form URL from an email body."""
    match = FORM_URL_PATTERN.search(email_body or "")
    return match.group(0) if match else None


def is_pdf_attachment(attachment: dict) -> bool:
    mime = str(attachment.get("mimeType") or "").lower()
    filename = str(attachment.get("filename") or "").lower()
    return "pdf" in mime or filename.endswith(".pdf")


def decode_attachment_data(data: str) -> bytes:
    """Decode base64url Gmail attachment data."""
    payload = data or ""
    padding = 4 - (len(payload) % 4)
    payload += "=" * (padding % 4)
    return base64.urlsafe_b64decode(payload)


def classify_attachment(attachment: dict) -> str:
    """Classify attachment type for downstream form/document handlers."""
    if is_pdf_attachment(attachment):
        return "form_pdf"
    mime = str(attachment.get("mimeType") or "").lower()
    if "image" in mime:
        return "image"
    return "other"


def summarize_attachment(filename: str) -> dict:
    path = Path(filename)
    extension = path.suffix.lower()
    is_attachment = extension in ATTACHMENT_EXTENSIONS
    kind = "form" if re.search(r"form|request", path.stem, re.IGNORECASE) else "document"
    return {
        "filename": filename,
        "processed": is_attachment,
        "kind": kind,
        "extension": extension,
    }
