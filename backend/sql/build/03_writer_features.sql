-- One row per writer with catalog + recording-activity features.
-- "Recent" windows are anchored on build_meta.as_of_year (end of the data), not today.

CREATE OR REPLACE TABLE writer_features AS
WITH m AS (SELECT as_of_year FROM build_meta),
published_works AS (
    SELECT DISTINCT work_id
    FROM shares
    WHERE party_role IN ('OriginalPublisher', 'SubstitutedPublisher')
),
per_work AS (
    -- Disputed registrations stay on the writer detail, but they are not cuts.
    SELECT
        ws.writer_id,
        ws.work_id,
        bool_or(ws.is_published) AS is_published,
        (pw.work_id IS NOT NULL) AS work_has_publisher
    FROM writer_shares ws
    JOIN works w USING (work_id)
    LEFT JOIN published_works pw USING (work_id)
    WHERE NOT coalesce(w.in_dispute, false)
    GROUP BY ALL
),
work_agg AS (
    SELECT writer_id,
           count(*)                                 AS works,
           count(*) FILTER (WHERE NOT is_published) AS unpublished_works,
           -- Works with no publisher party at all. If this is 0, every song
           -- already has a publisher sitting on it; a missing pointer is a
           -- chain gap (Botlok / Elvin), not an unsigned catalog.
           count(*) FILTER (WHERE NOT work_has_publisher) AS bare_works
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
    -- One row per recording. Duplicate ISRCs with variant artist strings
    -- used to inflate distinct_artists (the same Bad Bunny cut counted 5 times).
    -- Karaoke / tribute / piano-channel credits are not "an artist cut the song."
    SELECT
        pw.writer_id,
        r.isrc,
        min(r.recording_year) AS recording_year,
        mode(r.artist_key) FILTER (
            WHERE r.artist_key IS NOT NULL AND r.artist_key <> ''
              AND NOT regexp_matches(r.artist_key,
                  '\b(VARIOUS ARTISTS|PARTY TYME|KARAOKE|KIDZ BOP|SLOWED|TRIBUT|WORKOUT MUSIC|BASS BOOSTED|PIANO|8D TUNES|SOUNDMIX)\b')
        ) AS artist_key
    FROM per_work pw
    JOIN releases r USING (work_id)
    GROUP BY pw.writer_id, r.isrc
),
-- Score and eligibility use commercial cuts only. Cover-only ISRCs stay off the list.
commercial AS (
    SELECT * FROM rec WHERE artist_key IS NOT NULL
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
    FROM commercial rec CROSS JOIN m
    GROUP BY rec.writer_id
)
SELECT
    w.writer_id,
    w.display_name,
    w.ipi_name_number,
    w.has_person_name,
    w.party_ids,
    coalesce(wa.works, 0)             AS works,
    coalesce(wa.unpublished_works, 0) AS unpublished_works,
    coalesce(wa.bare_works, 0)        AS bare_works,
    coalesce(ra.recordings, 0)        AS recordings,
    coalesce(ra.distinct_artists, 0)  AS distinct_artists,
    ra.first_year,
    ra.last_year,
    ra.career_start_year,
    coalesce(ra.pre2010_recordings, 0) AS pre2010_recordings,
    coalesce(ra.recent_recordings, 0) AS recent_recordings,
    coalesce(ra.prior_recordings, 0)  AS prior_recordings,
    coalesce(ra.recent_artists, 0)    AS recent_artists,
    coalesce(pc.works_with_published_cowriter, 0) AS works_with_published_cowriter,
    coalesce(pc.works_with_published_cowriter, 0)
        / nullif(wa.works, 0)         AS published_cowrite_share,
    coalesce(wa.works, 0)
        / greatest(ra.last_year - ra.career_start_year + 1, 1) AS works_per_active_year
FROM writers w
LEFT JOIN work_agg wa USING (writer_id)
LEFT JOIN rec_agg ra USING (writer_id)
LEFT JOIN published_cowrites pc USING (writer_id);
