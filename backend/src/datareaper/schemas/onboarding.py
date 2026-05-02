from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, model_validator


class OnboardingInitializeRequest(BaseModel):
    seeds: list[str] = Field(min_length=1)
    seed_type: Literal["email", "phone", "auto"] = "auto"
    jurisdiction: str = "DPDP"
    consent_confirmed: bool = True

    @model_validator(mode="before")
    @classmethod
    def migrate_legacy_seed_field(cls, value):
        if isinstance(value, dict) and "seeds" not in value and value.get("seed"):
            migrated = dict(value)
            migrated["seeds"] = [str(value["seed"])]
            return migrated
        return value


class OnboardingInitializeResponse(BaseModel):
    scan_id: str
    normalized_seed: str
    status: str
    boot_log: list[str]
