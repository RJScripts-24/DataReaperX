from pathlib import Path

print(Path("backend/data/brokers/broker_catalog.yaml").read_text(encoding="utf-8"))
