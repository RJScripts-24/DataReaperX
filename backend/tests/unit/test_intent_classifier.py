from datareaper.comms.intent_classifier import classify_intent


def test_intent_classifier() -> None:
    assert classify_intent("Please send government ID") == "illegal_pushback"
