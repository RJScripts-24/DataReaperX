import pytest

from datareaper.osint.identity_resolver import resolve_identity


@pytest.mark.asyncio
async def test_identity_resolution() -> None:
    result = await resolve_identity([{"name": "John Doe"}, {"location": "Bangalore"}], llm=None)
    assert result["real_name"] == "John Doe"
