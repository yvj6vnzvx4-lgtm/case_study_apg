from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes import writers

app = FastAPI(title="Writer Scout API", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET"], allow_headers=["*"])
app.include_router(writers.router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
