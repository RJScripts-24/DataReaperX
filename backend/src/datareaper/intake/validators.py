from __future__ import annotations

try:
    from email_validator import EmailNotValidError, validate_email
except Exception:  # pragma: no cover - local fallback
    EmailNotValidError = ValueError

    def validate_email(value: str, check_deliverability: bool = False) -> bool:
        if "@" not in value or "." not in value.split("@")[-1]:
            raise EmailNotValidError("Invalid email address")
        return True

from datareaper.core.exceptions import InvalidSeedError


def infer_seed_type(seed: str) -> str:
    return "email" if "@" in seed else "phone"


def validate_seed(seed: str, seed_type: str) -> None:
    if seed_type == "email":
        try:
            validate_email(seed, check_deliverability=False)
        except EmailNotValidError as exc:
            raise InvalidSeedError(str(exc)) from exc
        return
    if seed_type == "phone" and len([ch for ch in seed if ch.isdigit()]) < 8:
        raise InvalidSeedError("Phone number is too short")
