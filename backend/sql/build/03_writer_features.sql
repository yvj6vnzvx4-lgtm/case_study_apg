-- One row per writer with catalog + recording-activity features.
-- "Recent" windows are anchored on build_meta.as_of_year (end of the data), not today.

CREATE OR REPLACE TABLE writer_features AS
WITH m AS (SELECT as_of_year FROM build_meta),
per_work AS (
    SELECT writer_id, work_id, bool_or(is_published) AS is_published
    FROM writer_shares
    GROUP BY ALL
),
work_agg AS (
    SELECT writer_id,
           count(*)                                AS works,
           count(*) FILTER (WHERE NOT is_published) AS unpublished_works
    FROM per_work
    GROUP BY writer_id
),
-- Industry validation: works co-written with a *different* writer who IS published,
-- i.e. this writer is already in rooms with signed writers.
published_cowrites AS (
    SELECT a.writer_id, count(DISTINCT a.work_id) AS works_with_published_cowriter
    FROM per_work a
    JOIN per_work b ON b.work_id = a.work_id AND b.writer_id <> a.writer_id AND b.is_published
    GROUP BY a.writer_id
),
rec AS (
    SELECT DISTINCT pw.writer_id, r.isrc, r.artist_key, r.recording_year
    FROM per_work pw
    JOIN releases r USING (work_id)
),
rec_agg AS (
    SELECT
        rec.writer_id,
        count(DISTINCT rec.isrc)       AS recordings,
        count(DISTINCT rec.artist_key) AS distinct_artists,
        min(rec.recording_year)        AS first_year,
        max(rec.recording_year)        AS last_year,
        -- robust career start: year by which 10% of recordings exist. A single stray
        -- old ISRC (or a same-name merge) shouldn't make a 2020s writer look "legacy".
        quantile_disc(rec.recording_year, 0.1) AS career_start_year,
        count(DISTINCT rec.isrc) FILTER (WHERE rec.recording_year < 2010) AS pre2010_recordings,
        count(DISTINCT rec.isrc)       FILTER (WHERE rec.recording_year >= m.as_of_year - 1)                         AS recent_recordings,
        count(DISTINCT rec.isrc)       FILTER (WHERE rec.recording_year BETWEEN m.as_of_year - 3 AND m.as_of_year - 2) AS prior_recordings,
        count(DISTINCT rec.artist_key) FILTER (WHERE rec.recording_year >= m.as_of_year - 1)                         AS recent_artists
    FROM rec CROSS JOIN m
    GROUP BY rec.writer_id
)
SELECT
    w.writer_id,
    w.display_name,
    w.ipi_name_number,
    w.party_ids,
    wa.works,
    wa.unpublished_works,
    coalesce(ra.recordings, 0)        AS recordings,
    coalesce(ra.distinct_artists, 0)  AS distinct_artists,
    ra.first_year,
    ra.last_year,
    ra.career_start_year,
    coalesce(ra.pre2010_recordings, 0) AS pre2010_recordings,
    coalesce(ra.recent_recordings, 0) AS recent_recordings,
    coalesce(ra.prior_recordings, 0)  AS prior_recordings,
    coalesce(ra.recent_artists, 0)    AS recent_artists,
    coalesce(pc.works_with_published_cowriter, 0)                AS works_with_published_cowriter,
    coalesce(pc.works_with_published_cowriter, 0) / wa.works     AS published_cowrite_share,
    wa.works / greatest(ra.last_year - ra.career_start_year + 1, 1) AS works_per_active_year
FROM writers w
JOIN work_agg wa USING (writer_id)
LEFT JOIN rec_agg ra USING (writer_id)
LEFT JOIN published_cowrites pc USING (writer_id);
