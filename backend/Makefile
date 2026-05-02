dev:
	uv run uvicorn datareaper.main:app --reload --app-dir src

test:
	uv run pytest

lint:
	uv run ruff check .

## ── Shield Extension ─────────────────────────────────────────────────────

.PHONY: shield-icons shield-package shield-clean

shield-icons: ## Generate extension icons (requires: cd extension && npm install)
	cd ../extension && node generate-icons.js

shield-package: ## Package extension zip (reads GOOGLE_SAFE_BROWSING_API_KEY etc. from env)
	cd ../extension && node package-extension.js

shield-clean: ## Remove generated icon PNGs, config shim, and zip
	rm -f ../extension/icons/icon*.png
	rm -f ../extension/background-config-init.js
	rm -f static/datareaper-tripwire.zip
	@echo "Shield build artifacts cleaned."
