"""Look up Spotify catalog data for a SQL-shortlisted set of writers,
cache results in spotify_tracks, then recompute writer_scores.

Usage: python scripts/enrich_spotify.py [--writers 100] [--max-isrcs 400]
"""
import argparse
import sys
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import db, pipeline  # noqa: E402
from app.spotify import QuotaExceeded, SpotifyClient  # noqa: E402

SHORTLIST_SQL = """
WITH shortlist AS (
    SELECT writer_id, score FROM writer_scores
    WHERE exclusion_reason IS NULL
    ORDER BY score DESC
    LIMIT $writers
),
ranked_isrcs AS (
    SELECT r.isrc, max(s.score) AS writer_score
    FROM shortlist s
    JOIN writer_shares ws USING (writer_id)
    JOIN works w USING (work_id)
    JOIN releases r USING (work_id)
    WHERE r.isrc IS NOT NULL
      AND NOT coalesce(w.in_dispute, false)
      AND r.isrc NOT IN (SELECT isrc FROM spotify_tracks)
    GROUP BY r.isrc
)
SELECT isrc FROM ranked_isrcs
ORDER BY writer_score DESC
LIMIT $max_isrcs
"""

INSERT_SQL = """
INSERT OR REPLACE INTO spotify_tracks
    (isrc, spotify_id, track_name, artists, artist_ids, genres, album_name,
     album_type, duration_ms, explicit, spotify_url)
VALUES
    ($isrc, $spotify_id, $track_name, $artists, $artist_ids, $genres, $album_name,
     $album_type, $duration_ms, $explicit, $spotify_url)
"""


def row_from_track(isrc: str, t: dict | None, genres: list[str]) -> dict:
    if not t:
        return {
            "isrc": isrc, "spotify_id": None, "track_name": None, "artists": None,
            "artist_ids": None, "genres": None, "album_name": None, "album_type": None,
            "duration_ms": None, "explicit": None, "spotify_url": None,
        }
    artists = t.get("artists") or []
    album = t.get("album") or {}
    urls = t.get("external_urls") or {}
    return {
        "isrc": isrc,
        "spotify_id": t.get("id"),
        "track_name": t.get("name"),
        "artists": ", ".join(a.get("name", "") for a in artists if a.get("name")),
        "artist_ids": ",".join(a["id"] for a in artists if a.get("id")),
        "genres": "|".join(genres) if genres else None,
        "album_name": album.get("name"),
        "album_type": album.get("album_type"),
        "duration_ms": t.get("duration_ms"),
        "explicit": t.get("explicit"),
        "spotify_url": urls.get("spotify") or (f"https://open.spotify.com/track/{t['id']}" if t.get("id") else None),
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--writers", type=int, default=625)
    ap.add_argument("--max-isrcs", type=int, default=3500)
    ap.add_argument("--genres", action="store_true", help="also fetch artist genres (extra API calls)")
    args = ap.parse_args()

    con = db.connect(read_only=False)
    db.run_script(con, "build/04_spotify.sql")
    isrcs = [r[0] for r in con.execute(SHORTLIST_SQL, {"writers": args.writers, "max_isrcs": args.max_isrcs}).fetchall()]
    print(f"looking up {len(isrcs)} ISRCs", flush=True)
    sp = SpotifyClient()
    matched = skipped = 0
    for i, isrc in enumerate(isrcs, 1):
        try:
            t = sp.track_by_isrc(isrc)
        except QuotaExceeded as e:
            hours = e.retry_after / 3600
            print(f"Spotify quota exceeded; retry in ~{hours:.1f}h. Rescoring cache.", flush=True)
            break
        except httpx.HTTPStatusError as e:
            skipped += 1
            print(f"  skip {isrc}: HTTP {e.response.status_code}", flush=True)
            continue
        artist_ids = [a["id"] for a in (t.get("artists") or []) if a.get("id")] if t else []
        # Artist /genres is 403 in many Dev Mode apps and burns the same rate limit as ISRC search.
        genres = []
        if artist_ids and args.genres:
            genres = sp.genres_for_artists(artist_ids)
        con.execute(INSERT_SQL, row_from_track(isrc, t, genres))
        matched += bool(t)
        if i % 25 == 0 or i == len(isrcs):
            print(f"  {i}/{len(isrcs)} ({matched} on Spotify, {skipped} skipped)", flush=True)
    pipeline.rescore(con)
    n = con.execute("SELECT count(*) FILTER (WHERE spotify_id IS NOT NULL), count(*) FROM spotify_tracks").fetchone()
    print(f"cache: {n[0]} matched / {n[1]} looked up; rescored", flush=True)


if __name__ == "__main__":
    main()
