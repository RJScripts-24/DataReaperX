from __future__ import annotations


def build_graph(
    seed: str,
    accounts: list[str],
    targets: list[str],
    usernames: list[str] | None = None,
    identity: dict | None = None,
) -> dict:
    usernames = usernames or []
    identity = identity or {"name": "John Doe", "location": "Bangalore"}
    identity_name = str(identity.get("name") or "Unknown")
    identity_location = str(identity.get("location") or "Unknown")

    nodes = [
        {"id": "seed", "type": "seed", "label": seed, "x": 400, "y": 300, "data": {"kind": "seed"}},
    ]
    edges: list[dict] = []

    for index, account in enumerate(accounts, start=1):
        account_id = f"account_{index}"
        nodes.append(
            {
                "id": account_id,
                "type": "platform",
                "label": account,
                "x": 180 + (index * 140),
                "y": 180,
                "data": {"platform": account},
            }
        )
        edges.append({"source": "seed", "target": account_id, "relationship": "pivoted_to"})

        if index <= len(usernames):
            username_id = f"username_{index}"
            nodes.append(
                {
                    "id": username_id,
                    "type": "username",
                    "label": usernames[index - 1],
                    "x": 150 + (index * 160),
                    "y": 280,
                    "data": {"platform": account, "value": usernames[index - 1]},
                }
            )
            edges.append(
                {"source": account_id, "target": username_id, "relationship": "discovered_username"}
            )

    identity_nodes = [
        {
            "id": "identity_name",
            "type": "identity",
            "label": identity_name,
            "x": 250,
            "y": 420,
            "data": {"kind": "person"},
        },
        {
            "id": "identity_location",
            "type": "identity",
            "label": identity_location,
            "x": 550,
            "y": 420,
            "data": {"kind": "location"},
        },
    ]
    nodes.extend(identity_nodes)

    if usernames:
        edges.append(
            {"source": "username_1", "target": "identity_name", "relationship": "resolved_identity"}
        )
    else:
        edges.append({"source": "seed", "target": "identity_name", "relationship": "resolved_identity"})

    edges.append({"source": "identity_name", "target": "identity_location", "relationship": "correlates_with"})

    for index, target in enumerate(targets, start=1):
        target_id = f"target_{index}"
        nodes.append(
            {
                "id": target_id,
                "type": "target",
                "label": target,
                "x": 160 + (index * 170),
                "y": 560,
                "data": {"status": "Target Acquired"},
            }
        )
        edges.append({"source": "identity_name", "target": target_id, "relationship": "found_on_broker"})

    return {"nodes": nodes, "edges": edges}
