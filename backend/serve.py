"""Deployment entrypoint: the API mounted under /api.

On Vercel, the top-level rewrite sends /api/* to this service with the path unchanged
(it receives /api/writers, not /writers), so the routes live under /api here.
Locally `make api` serves the same app, so the web client uses /api everywhere.
"""
from fastapi import FastAPI

from app.main import app as core

app = FastAPI(title="Writer Scout", docs_url=None, redoc_url=None)
app.mount("/api", core)  # interactive docs at /api/docs
