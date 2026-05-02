from __future__ import annotations

from datareaper.core.config import get_settings

COUNTRY_CODE_MAPPING = {
    "IN": "DPDP",
    "US": "CCPA",
    "DE": "GDPR",
    "FR": "GDPR",
    "IT": "GDPR",
    "ES": "GDPR",
    "NL": "GDPR",
}

INDIA_LOCATION_HINTS = {
    "india",
    "bharat",
    "bengaluru",
    "bangalore",
    "new delhi",
    "delhi",
    "mumbai",
    "chennai",
    "hyderabad",
    "pune",
    "kolkata",
    "gurgaon",
    "gurugram",
    "noida",
    "ahmedabad",
}

CALIFORNIA_HINTS = {
    "california",
    "los angeles",
    "san francisco",
    "san diego",
    "san jose",
    "sacramento",
}

EU_LOCATION_HINTS = {
    "germany",
    "france",
    "spain",
    "italy",
    "netherlands",
    "european union",
}


def resolve_jurisdiction(country_code: str = "", location: str | None = None) -> str:
    code = country_code.strip().upper()
    if code in COUNTRY_CODE_MAPPING:
        return COUNTRY_CODE_MAPPING[code]

    normalized_location = str(location or "").strip().lower()
    if normalized_location:
        if any(token in normalized_location for token in INDIA_LOCATION_HINTS):
            return "DPDP"
        if any(token in normalized_location for token in CALIFORNIA_HINTS):
            return "CCPA"
        if any(token in normalized_location for token in EU_LOCATION_HINTS):
            return "GDPR"

    return get_settings().default_jurisdiction
