from fastapi.testclient import TestClient

from app.routes import writers
from serve import app


def test_routes_are_served_under_api_prefix(con):
    from app.main import app as core

    core.dependency_overrides[writers.get_con] = lambda: con
    try:
        client = TestClient(app)
        assert client.get("/api/health").json() == {"status": "ok"}
        assert client.get("/api/writers?limit=1").status_code == 200
        assert client.get("/writers").status_code == 404   # nothing outside /api
    finally:
        core.dependency_overrides.clear()
