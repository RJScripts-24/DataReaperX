# DataReaper Backend

FastAPI backend for the DataReaper privacy-defense platform.

## Stack

- FastAPI
- SQLAlchemy 2.x
- Pydantic v2
- Neon PostgreSQL
- Uvicorn
- pytest

## Quickstart

1. Copy `.env.example` to `.env`
2. Update your Neon connection string
3. Install dependencies with `uv sync`
4. Start the API with `uv run uvicorn datareaper.main:app --reload --app-dir src`

## Dev Stack (API + Worker)

Run both the API and background worker with one command:

```powershell
Set-Location backend
.\scripts\start_stack.ps1
```

The launcher avoids duplicate workers, starts the worker if needed, and then starts the API.
