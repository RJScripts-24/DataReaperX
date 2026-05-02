from pathlib import Path

print(Path("backend/data/platforms/email_probe_catalog.yaml").read_text(encoding="utf-8"))
