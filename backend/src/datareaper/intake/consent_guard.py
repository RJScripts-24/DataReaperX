from __future__ import annotations

from datareaper.core.exceptions import DataReaperError


def enforce_consent(consent_confirmed: bool) -> None:
    if not consent_confirmed:
        raise DataReaperError("Consent is required before scanning begins")
