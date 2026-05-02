from __future__ import annotations

from functools import lru_cache
from urllib.parse import urlparse

from email_validator import EmailNotValidError, validate_email

from datareaper.brokers.catalog import load_broker_catalog


@lru_cache(maxsize=1)
def _broker_email_map() -> dict[str, str]:
    catalog = load_broker_catalog().get("brokers", [])
    return {
        str(item["name"]): str(item["opt_out_email"])
        for item in catalog
        if isinstance(item, dict) and item.get("name") and item.get("opt_out_email")
    }


@lru_cache(maxsize=1)
def _broker_catalog_by_name() -> dict[str, dict]:
    catalog = load_broker_catalog().get("brokers", [])
    return {
        str(item["name"]): item
        for item in catalog
        if isinstance(item, dict) and item.get("name")
    }


def _broker_domains(broker_name: str) -> set[str]:
    broker = _broker_catalog_by_name().get(broker_name) or {}
    domains: set[str] = set()
    for field in ("search_url", "opt_out_url"):
        raw = str(broker.get(field) or "").strip()
        if not raw:
            continue
        host = urlparse(raw).netloc.lower().strip()
        if host.startswith("www."):
            host = host[4:]
        if host:
            domains.add(host)
    return domains


def get_opt_out_email(broker_name: str) -> str:
    return _broker_email_map().get(broker_name, "")


def _recipient_is_broker_aligned(recipient_domain: str, broker_name: str) -> bool:
    broker_domains = _broker_domains(broker_name)
    if not broker_domains:
        return True
    lowered = recipient_domain.lower().strip()
    return any(lowered == domain or lowered.endswith(f".{domain}") for domain in broker_domains)


def resolve_dispatch_recipient(broker_name: str) -> tuple[str, str | None]:
    recipient = get_opt_out_email(broker_name).strip().lower()
    if not recipient:
        return "", "missing_contact"

    try:
        normalized = validate_email(recipient, check_deliverability=True)
    except EmailNotValidError as exc:
        return "", f"invalid_email:{exc}"

    if not _recipient_is_broker_aligned(normalized.domain, broker_name):
        return "", "domain_mismatch"

    local_part = normalized.local_part.lower()
    if local_part in {"noreply", "no-reply", "donotreply", "do-not-reply"}:
        return "", "non_reply_mailbox"

    return normalized.email, None


__all__ = ["get_opt_out_email", "resolve_dispatch_recipient"]
