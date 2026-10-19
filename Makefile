.PHONY: setup db enrich serving api web test

setup:            ## install API + web deps
	cd backend && uv venv && uv pip install -e ".[dev]"
	cd web && npm install

db:               ## build compact DuckDB from parquet + run SQL transforms
	cd backend && uv run python scripts/build_db.py

serving:          ## export the compact parquet snapshot the hosted API uses
	cd backend && uv run python scripts/export_serving.py

enrich:           ## pull Spotify popularity for shortlisted writers' recordings
	cd backend && uv run python scripts/enrich_spotify.py

api:              ## run API on :8000 (routes under /api)
	cd backend && uv run uvicorn serve:app --reload --port 8000

web:              ## run web client on :5173
	cd web && npm run dev

test:
	cd backend && uv run pytest -q
