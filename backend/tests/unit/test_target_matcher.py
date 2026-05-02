from datareaper.osint.matchers.target_matcher import match_target


def test_target_matcher() -> None:
    assert match_target("Apollo.io", ["Apollo.io", "Spokeo"]) == "Apollo.io"
