import pytest

from app import pipeline
from tests.conftest import writer


def test_as_of_year_comes_from_data_not_today(con):
    assert con.execute("SELECT as_of_year FROM build_meta").fetchone()[0] == 2024


def test_recording_year_from_isrc_with_fallback(con):
    years = dict(con.execute("SELECT isrc, recording_year FROM releases").fetchall())
    assert years["USAAA2400001"] == 2024
    assert years["USAAA9500010"] == 1995      # yy > as_of_year -> 1900s
    assert years["BADISRC"] == 2023           # malformed ISRC -> release_date year


def test_junk_release_dates_become_null(con):
    d = con.execute("SELECT release_date FROM releases WHERE isrc = 'USAAA2300002'").fetchone()[0]
    assert d is None


def test_publisher_link_marks_share_published(con):
    rows = dict(con.execute("SELECT share_id, is_published FROM writer_shares WHERE share_id IN ('S1','S2','S3','S5')").fetchall())
    assert rows == {"S1": False, "S2": False, "S3": True, "S5": True}


def test_same_name_merges_onto_ipi_holder(con):
    alice = writer(con, "ALICE SMITH")
    assert sorted(alice["party_ids"]) == [1, 5]
    assert alice["works"] == 3                # W1, W2 (party 1) + W6 (party 5)


def test_ids_stripped_from_names(con):
    assert writer(con, "CAROL JONES")["works"] == 1


def test_features(con):
    a = writer(con, "ALICE SMITH")
    assert a["recordings"] == 5
    assert a["distinct_artists"] == 5
    assert a["recent_recordings"] == 4        # 2023-2024
    assert a["prior_recordings"] == 1         # 2021-2022
    assert a["works_with_published_cowriter"] == 1   # W2 with Bob


@pytest.mark.parametrize("name, reason", [
    ("ALICE SMITH", None),
    ("CAROL JONES", None),
    ("BOB SIGNED", "has_publisher"),
    ("PUBLIC DOMAIN", "not_a_person"),
    ("OLD TIMER", "legacy_catalog"),
    ("QUIET PERSON", "inactive"),
    ("TINA THIN", "insufficient_data"),
    ("DAN FARMER", "high_volume_catalog"),
])
def test_exclusion_rules(con, name, reason):
    assert writer(con, name)["exclusion_reason"] == reason


def test_excluded_writers_have_no_score(con):
    assert writer(con, "BOB SIGNED")["score"] is None


def test_catalog_only_score(con):
    # Alice tops reach, momentum, validation, depth; Carol only tops growth.
    # Without Spotify data the popularity slice (0.25) is removed and weights renormalized.
    a, c = writer(con, "ALICE SMITH"), writer(con, "CAROL JONES")
    assert a["p_popularity"] is None
    assert a["score"] == pytest.approx(100 * 0.65 / 0.75, abs=0.1)
    assert c["score"] == pytest.approx(100 * 0.10 / 0.75, abs=0.1)


def test_spotify_popularity_enters_score_after_rescore(con):
    con.execute("""INSERT INTO spotify_tracks (isrc, spotify_id, popularity) VALUES
                   ('USAAA2400001', 'a', 10), ('USAAA2400019', 'c', 90)""")
    pipeline.rescore(con)
    a, c = writer(con, "ALICE SMITH"), writer(con, "CAROL JONES")
    assert (a["p_popularity"], c["p_popularity"]) == (0.0, 1.0)
    assert a["score"] == pytest.approx(65.0, abs=0.1)
    assert c["score"] == pytest.approx(35.0, abs=0.1)
