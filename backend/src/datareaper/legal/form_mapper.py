from __future__ import annotations

import re

FIELD_MAP = {
    "name": ["full_name", "name", "firstname", "first_name", "your_name"],
    "email": ["email", "email_address", "your_email"],
    "phone": ["phone", "phone_number", "telephone"],
    "location": ["city", "state", "location", "address"],
}


def build_field_map(broker_name: str, identity: dict, form_html: str) -> dict[str, str]:
    """Build a non-sensitive field map for broker opt-out forms."""
    _ = broker_name
    result: dict[str, str] = {}
    input_names = re.findall(
        r'<input[^>]+name=["\']([^"\']+)["\']',
        form_html or "",
        re.IGNORECASE,
    )

    for input_name in input_names:
        lower = input_name.lower()
        if any(token in lower for token in ["passport", "ssn", "social_security", "dob", "birth", "gov"]):
            continue
        for field, aliases in FIELD_MAP.items():
            if any(alias in lower for alias in aliases):
                value = identity.get(field) or identity.get("real_name" if field == "name" else field)
                if value:
                    result[f"[name='{input_name}']"] = str(value)
                break
    return result


def map_form_fields(identity: dict) -> dict:
    return build_field_map("", identity, "")


__all__ = ["build_field_map", "map_form_fields"]
