import os

from fastapi.testclient import TestClient

from datareaper.core.config import get_settings

os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("APP_AUTO_CREATE_TABLES", "true")
get_settings.cache_clear()

from datareaper.main import app


def build_test_client() -> TestClient:
    return TestClient(app)
