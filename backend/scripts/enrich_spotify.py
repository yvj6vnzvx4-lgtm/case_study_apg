"""Look up Spotify popularity for recordings of a SQL-shortlisted set of writers,
cache results in spotify_tracks, then recompute writer_scores.

Usage: python scripts/enrich_spotify.py [--writers 500] [--max-isrcs 5000]
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import db, pipeline  # noqa: E402
from app.spotify import SpotifyClient  # noqa: E402

# Stage 2 of ranking: only the top-N writers by the catalog-only score get looked up.
SHORTLIST_SQL = """
WITH shortlist AS (
    SELECT writer_id FROM writer_scores
    WHERE exclusion_reason IS NULL
    ORDER BY score DESC
    LIMIT $writers
)
SELECT DISTINCT r.isrc
FROM shortlist
JOIN writer_shares ws USING (writer_id)
JOIN releases r USING (work_id)
WHERE r.isrc IS NOT NULL
  AND r.isrc NOT IN (SELECT isrc FROM spotify_tracks)
LIMIT $max_isrcs
"""

INSERT_SQL = """
INSERT OR REPLACE INTO spotify_tracks (isrc, spotify_id, track_name, artists, popularity)
VALUES ($isrc, $spotify_id, $track_name, $artists, $popularity)
"""


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--writers", type=int, default=500)
    ap.add_argument("--max-isrcs", type=int, default=5000)
    args = ap.parse_args()

    con = db.connect(read_only=False)
    isrcs = [r[0] for r in con.execute(SHORTLIST_SQL, {"writers": args.writers, "max_isrcs": args.max_isrcs}).fetchall()]
    print(f"looking up {len(isrcs)} ISRCs")
    sp = SpotifyClient()
    for i, isrc in enumerate(isrcs, 1):
        t = sp.track_by_isrc(isrc)
        con.execute(INSERT_SQL, {
            "isrc": isrc,
            "spotify_id": t and t["id"],
            "track_name": t and t["name"],
            "artists": t and ", ".join(a["name"] for a in t["artists"]),
            # Spotify dropped `popularity` for Development Mode apps (Feb 2026); keep NULL if absent
            "popularity": t.get("popularity") if t else None,
        })
        if i % 100 == 0:
            print(f"  {i}/{len(isrcs)}")
    pipeline.rescore(con)
    with_pop = con.execute("SELECT count(popularity) FROM spotify_tracks").fetchone()[0]
    if not with_pop:
        print("NOTE: no popularity values returned (dev-mode app?) - ranking stays catalog-only")
    print("rescored")


if __name__ == "__main__":
    main()
