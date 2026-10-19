from fastapi.testclient import TestClient

from app import db
from app.main import app
from app.routes import writers


def test_serving_snapshot_matches_full_db(con, tmp_path):
    db.run_script(con, "export/serving.sql", out_dir=str(tmp_path))
    snap = db.connect_serving(tmp_path)
    client = TestClient(app)

    def responses(c):
        app.dependency_overrides[writers.get_con] = lambda: c
        out = [client.get(p).json() for p in ("/writers", "/stats", "/meta")]
        top = out[0][0]["writer_id"]
        out.append(client.get(f"/writers/{top}").json())
        app.dependency_overrides.clear()
        return out

    assert responses(snap) == responses(con)
    # only ranked writers are shipped
    assert snap.execute("SELECT count(*) FROM writer_scores").fetchone()[0] == 2
