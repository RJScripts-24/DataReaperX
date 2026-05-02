from datareaper.osint.graph_builder import build_graph


def test_graph_builder() -> None:
    graph = build_graph("user@email.com", ["GitHub"], ["Apollo.io"])
    assert graph["nodes"]
