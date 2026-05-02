"""Integration tests for the Shield API endpoints.

Requires Redis to be running (uses the Redis URL from test env config).
"""

import os
import tempfile
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient


def _build_client() -> TestClient:
    from datareaper.main import app

    return TestClient(app)


def _valid_session_headers() -> dict:
    return {"X-Session-Id": "test-session-0123456789abcdef"}


def _mock_redis_for_test(monkeypatch):
    """Replace get_redis with an in-memory mock for tests that need Redis."""
    import datareaper.api.routes.shield as shield_mod

    mock = AsyncMock()
    store: dict[str, str] = {}

    async def mock_get(key: str) -> str | None:
        return store.get(key)

    async def mock_setex(key: str, ttl: int, value: str) -> None:
        store[key] = value

    mock.get = mock_get
    mock.setex = mock_setex

    async def get_redis_mock():
        return mock

    monkeypatch.setattr(shield_mod, "get_redis", get_redis_mock)
    return mock, store


# ---------------------------------------------------------------------------
# POST /api/shield/token
# ---------------------------------------------------------------------------
def test_shield_token_missing_session_header() -> None:
    with _build_client() as client:
        res = client.post("/api/shield/token")
        assert res.status_code == 401
        assert "Missing or invalid" in res.json()["detail"]


def test_shield_token_success(monkeypatch) -> None:
    _mock, store = _mock_redis_for_test(monkeypatch)

    with _build_client() as client:
        res = client.post("/api/shield/token", headers=_valid_session_headers())
        assert res.status_code == 200
        data = res.json()
        assert "shield_token" in data
        assert data["expires_in"] == 3600

        # Verify Redis store was populated
        expected_key = f"shield_token:{data['shield_token']}"
        assert expected_key in store
        assert store[expected_key] == "test-session-0123456789abcdef"

        # Clean up: clear cached router setting to avoid polluting other tests
        import datareaper.api.routes.shield as shield_mod

        monkeypatch.undo()


# ---------------------------------------------------------------------------
# GET /api/shield/status
# ---------------------------------------------------------------------------
def test_shield_status_missing_session_header() -> None:
    with _build_client() as client:
        res = client.get("/api/shield/status")
        assert res.status_code == 401


def test_shield_status_inactive(monkeypatch) -> None:
    _mock, store = _mock_redis_for_test(monkeypatch)

    with _build_client() as client:
        res = client.get("/api/shield/status", headers=_valid_session_headers())
        assert res.status_code == 200
        data = res.json()
        assert data["active"] is False
        assert data["last_seen"] is None


def test_shield_status_active(monkeypatch) -> None:
    _mock, store = _mock_redis_for_test(monkeypatch)

    # Pre-seed an active key
    store["shield_active:test-session-0123456789abcdef"] = "2025-01-01T00:00:00Z"

    with _build_client() as client:
        res = client.get("/api/shield/status", headers=_valid_session_headers())
        assert res.status_code == 200
        data = res.json()
        assert data["active"] is True
        assert data["last_seen"] == "2025-01-01T00:00:00Z"


# ---------------------------------------------------------------------------
# POST /api/shield/heartbeat
# ---------------------------------------------------------------------------
def test_shield_heartbeat_missing_token() -> None:
    with _build_client() as client:
        res = client.post("/api/shield/heartbeat")
        assert res.status_code == 401


def test_shield_heartbeat_invalid_token(monkeypatch) -> None:
    _mock, store = _mock_redis_for_test(monkeypatch)

    with _build_client() as client:
        res = client.post(
            "/api/shield/heartbeat",
            headers={"Authorization": "Bearer dead-token"},
        )
        assert res.status_code == 401


def test_shield_heartbeat_valid_token(monkeypatch) -> None:
    _mock, store = _mock_redis_for_test(monkeypatch)

    # Pre-seed a valid token→session mapping
    store["shield_token:valid-token"] = "test-session-0123456789abcdef"

    with _build_client() as client:
        res = client.post(
            "/api/shield/heartbeat",
            headers={"Authorization": "Bearer valid-token"},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["ok"] is True

        # Verify the active key was set
        active_key = "shield_active:test-session-0123456789abcdef"
        assert active_key in store


# ---------------------------------------------------------------------------
# GET /api/shield/download
# ---------------------------------------------------------------------------
def test_shield_download_missing_file() -> None:
    # Temporarily point the zip path to a non-existent location
    import datareaper.api.routes.shield as shield_mod

    with _build_client() as client:
        with patch.object(shield_mod, "_get_static_zip_path", return_value="/nonexistent/path.zip"):
            res = client.get("/api/shield/download")
            assert res.status_code == 404
            assert "Extension package not found" in res.json()["detail"]


def test_shield_download_success() -> None:
    import datareaper.api.routes.shield as shield_mod

    with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as f:
        f.write(b"fake-zip-content")
        temp_path = f.name

    try:
        with _build_client() as client:
            with patch.object(shield_mod, "_get_static_zip_path", return_value=temp_path):
                res = client.get("/api/shield/download")
                assert res.status_code == 200
                content_disposition = res.headers.get("content-disposition", "")
                assert "datareaper-tripwire.zip" in content_disposition
    finally:
        os.unlink(temp_path)