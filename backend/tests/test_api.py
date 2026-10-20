def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_top_writers_ranked_and_filtered(client):
    names = [w["display_name"].upper() for w in client.get("/writers").json()]
    assert names == ["ALICE SMITH", "CAROL JONES"]


def test_top_writers_limit_and_min_works(client):
    assert len(client.get("/writers?limit=1").json()) == 1
    assert [w["display_name"].upper() for w in client.get("/writers?min_works=2").json()] == ["ALICE SMITH"]


def test_top_writers_validates_params(client):
    assert client.get("/writers?limit=0").status_code == 422


def test_writer_detail(client):
    top = client.get("/writers").json()[0]
    body = client.get(f"/writers/{top['writer_id']}").json()
    assert body["writer"]["display_name"].upper() == "ALICE SMITH"
    assert {w["work_id"] for w in body["works"]} == {"W1", "W2", "W6", "WD"}
    assert any(w["work_id"] == "WD" and w["in_dispute"] for w in body["works"])


def test_writer_detail_404(client):
    assert client.get("/writers/999999").status_code == 404


def test_stats_funnel(client):
    stats = {r["status"]: r["writers"] for r in client.get("/stats").json()}
    assert stats["eligible"] == 2
    assert stats["has_publisher"] == 3
    assert stats["chain_ambiguous"] == 1


def test_search_keeps_global_rank(client):
    rows = client.get("/writers?q=carol").json()
    assert [(r["display_name"].upper(), r["rank"]) for r in rows] == [("CAROL JONES", 2)]


def test_contributions_sum_to_score(client):
    for r in client.get("/writers").json():
        parts = sum(r[k] or 0 for k in ("c_reach", "c_momentum", "c_validation", "c_growth", "c_depth", "c_dsp"))
        assert parts == __import__("pytest").approx(r["score"], abs=0.1)


def test_meta_weights_without_spotify(client):
    m = client.get("/meta").json()
    assert m["eligible_writers"] == 2 and m["has_spotify"] is False
    weights = {w["component"]: w["weight"] for w in m["weights"]}
    assert "dsp" not in weights and "popularity" not in weights
    assert sum(weights.values()) == __import__("pytest").approx(1.0)
