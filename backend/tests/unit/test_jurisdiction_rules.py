from datareaper.legal.jurisdiction_resolver import resolve_jurisdiction


def test_jurisdiction_rules() -> None:
    assert resolve_jurisdiction("IN") == "DPDP"
