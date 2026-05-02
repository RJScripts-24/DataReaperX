from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import AliasChoices, Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parents[3]
ENV_FILE = BACKEND_ROOT / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ENV_FILE, env_file_encoding="utf-8", extra="ignore")

    app_name: str = "DataReaper Backend"
    app_env: Literal["development", "test", "production"] = "development"
    app_host: str = Field(default="0.0.0.0", validation_alias=AliasChoices("APP_HOST", "API_HOST"))
    app_port: int = Field(default=8000, validation_alias=AliasChoices("APP_PORT", "API_PORT"))
    app_debug: bool = True
    app_log_level: str = "INFO"
    app_log_format: Literal["console", "json"] = "console"
    frontend_url: str = Field(default="http://localhost:5173", validation_alias=AliasChoices("FRONTEND_URL", "APP_FRONTEND_URL"))
    app_cors_origins: list[str] = Field(
        default_factory=list,
        validation_alias=AliasChoices("APP_CORS_ORIGINS", "CORS_ORIGINS"),
    )
    app_secret_key: str = "change-me"
    app_enable_demo_mode: bool = True
    app_auto_create_tables: bool = False
    app_startup_db_timeout_seconds: float = 15.0
    supabase_url: str = ""
    supabase_key: str = ""
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/postgres"
    sync_database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/postgres"
    redis_url: str = "redis://localhost:6379/0"
    arq_redis_url: str = ""
    llm_provider: str = "groq"
    groq_model: str = "llama-3.3-70b-versatile"
    groq_api_key: str = ""
    brave_search_api_key: str = ""
    github_api_token: str = ""
    serp_api_key: str = ""
    proxycurl_api_key: str = ""
    default_jurisdiction: str = "DPDP"
    gmail_client_id: str = ""
    gmail_client_secret: str = ""
    gmail_refresh_token: str = ""
    gmail_sender_email: str = ""
    playwright_headless: bool = True
    playwright_proxy_server: str = ""
    local_storage_path: str = "./storage"
    osint_enable_playwright_layers: bool = False
    osint_enable_platform_browser_fallback: bool = False
    osint_enable_search_probe: bool = False
    osint_enable_duckduckgo_fallback: bool = False
    osint_enable_paste_search: bool = False
    osint_enable_maigret: bool = True
    osint_enable_trafilatura: bool = True
    osint_debug_events: bool = False
    osint_platform_probe_candidates: int = 75
    osint_maigret_candidates: int = 8
    osint_maigret_top_sites: int = 150
    osint_maigret_max_connections: int = 24

    @property
    def project_root(self) -> Path:
        return Path(__file__).resolve().parents[3]

    @property
    def data_dir(self) -> Path:
        return self.project_root / "data"

    @property
    def is_supabase_db(self) -> bool:
        return "supabase" in self.database_url.lower()

    @property
    def effective_arq_redis_url(self) -> str:
        return self.arq_redis_url or self.redis_url

    @model_validator(mode="after")
    def ensure_cors_origins(self) -> "Settings":
        default_origins = {
            "http://localhost:5173",
            "http://localhost:3000",
        }
        if self.frontend_url:
            default_origins.add(self.frontend_url.rstrip("/"))

        configured = {origin.rstrip("/") for origin in self.app_cors_origins if origin}
        self.app_cors_origins = sorted(default_origins | configured)
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
