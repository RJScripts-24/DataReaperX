import os
from pathlib import Path

os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("APP_AUTO_CREATE_TABLES", "true")

from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient

from datareaper.core.config import get_settings

get_settings.cache_clear()


def _upgrade_db_schema_to_head() -> None:
    """Apply Alembic migrations so the test DB matches ORM (e.g. owner_google_sub)."""
    backend_root = Path(__file__).resolve().parents[1]
    alembic_ini = backend_root / "alembic.ini"
    if not alembic_ini.is_file():
        return
    cfg = Config(str(alembic_ini))
    cfg.set_main_option("script_location", str(backend_root / "migrations"))
    command.upgrade(cfg, "head")


_upgrade_db_schema_to_head()
get_settings.cache_clear()

from datareaper.main import app


def build_test_client() -> TestClient:
    return TestClient(app)
