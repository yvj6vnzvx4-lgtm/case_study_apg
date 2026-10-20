-- Cache of Spotify lookups, filled by scripts/enrich_spotify.py.
-- spotify_id NULL = looked up, no catalog match.
CREATE TABLE IF NOT EXISTS spotify_tracks (
    isrc         VARCHAR PRIMARY KEY,
    spotify_id   VARCHAR,
    track_name   VARCHAR,
    artists      VARCHAR,
    artist_ids   VARCHAR,
    genres       VARCHAR,          -- pipe-separated, from the recording artists
    album_name   VARCHAR,
    album_type   VARCHAR,          -- album | single | compilation
    duration_ms  INTEGER,
    explicit     BOOLEAN,
    spotify_url  VARCHAR,
    fetched_at   TIMESTAMP DEFAULT current_timestamp
);

ALTER TABLE spotify_tracks ADD COLUMN IF NOT EXISTS artist_ids VARCHAR;
ALTER TABLE spotify_tracks ADD COLUMN IF NOT EXISTS genres VARCHAR;
ALTER TABLE spotify_tracks ADD COLUMN IF NOT EXISTS album_name VARCHAR;
ALTER TABLE spotify_tracks ADD COLUMN IF NOT EXISTS album_type VARCHAR;
ALTER TABLE spotify_tracks ADD COLUMN IF NOT EXISTS duration_ms INTEGER;
ALTER TABLE spotify_tracks ADD COLUMN IF NOT EXISTS explicit BOOLEAN;
ALTER TABLE spotify_tracks ADD COLUMN IF NOT EXISTS spotify_url VARCHAR;
