"""Vercel entry point: serves the FastAPI app from backend/ under /api.

Vercel turns every .py file in /api into a function, so the backend lives in backend/
and this is the only file here. It reads the parquet snapshot in backend/serving/.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from fastapi import FastAPI  # noqa: E402

from app.main import app as core  # noqa: E402

app = FastAPI(title="Writer Scout", docs_url=None, redoc_url=None)
app.mount("/api", core)
