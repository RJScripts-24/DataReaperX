from datareaper.compliance.redaction import redact_email


def test_redaction() -> None:
    assert redact_email("user@email.com").startswith("u")
