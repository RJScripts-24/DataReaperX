from datareaper.intake.validators import validate_seed


def test_valid_email_seed() -> None:
    validate_seed("user@email.com", "email")
