SELECT
    b.as_of,
    b.as_of_year,
    (SELECT sum(writers) FROM writer_funnel)::BIGINT                        AS total_writers,
    (SELECT writers FROM writer_funnel WHERE status = 'eligible')           AS eligible_writers,
    (SELECT count(*) FROM spotify_tracks) > 0                               AS has_spotify,
    (SELECT count(*) FROM spotify_tracks WHERE spotify_id IS NOT NULL)      AS spotify_matches
FROM build_meta b;
