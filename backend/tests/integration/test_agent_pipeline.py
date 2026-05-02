from datareaper.orchestrator.graph import build_default_graph


def test_agent_pipeline() -> None:
    assert build_default_graph()[0] == "validate_seed"
