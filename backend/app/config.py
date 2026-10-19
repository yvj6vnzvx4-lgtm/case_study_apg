"""Settings read from environment / .env (repo root)."""
import os
from pathlib import Path

from dotenv import load_dotenv

API_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = API_DIR.parent
load_dotenv(REPO_ROOT / ".env")

SQL_DIR = API_DIR / "sql"
PARQUET_DIR = (REPO_ROOT / os.getenv("PARQUET_DIR", "../data/parquet")).resolve()
DB_PATH = (REPO_ROOT / os.getenv("DB_PATH", "data/writers.duckdb")).resolve()
# Compact read-only snapshot used when the full DB isn't present (e.g. the hosted API).
SERVING_DIR = API_DIR / "serving"

SPOTIFY_CLIENT_ID = os.getenv("SPOTIFY_CLIENT_ID", "")
SPOTIFY_CLIENT_SECRET = os.getenv("SPOTIFY_CLIENT_SECRET", "")
