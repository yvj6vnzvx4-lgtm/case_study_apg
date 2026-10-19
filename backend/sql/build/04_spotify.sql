-- Cache of Spotify lookups, filled by scripts/enrich_spotify.py.
CREATE TABLE IF NOT EXISTS spotify_tracks (
    isrc        VARCHAR PRIMARY KEY,
    spotify_id  VARCHAR,          -- NULL = looked up, no match
    track_name  VARCHAR,
    artists     VARCHAR,
    popularity  INTEGER,          -- 0-100
    fetched_at  TIMESTAMP DEFAULT current_timestamp
);
