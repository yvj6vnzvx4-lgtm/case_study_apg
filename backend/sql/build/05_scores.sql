-- Eligibility filters + composite score. Re-run after each Spotify enrichment.
-- See docs/DECISIONS.md for the reasoning behind every threshold and weight.

-- Single source of truth for weights (the API serves this table to the web client).
-- Without Spotify popularity, that slice is dropped and the rest are renormalized to sum to 1.
CREATE OR REPLACE TABLE score_weights AS
WITH base(component, sort_order, weight) AS (
    VALUES ('reach', 1, 0.25), ('momentum', 2, 0.20), ('validation', 3, 0.15),
           ('growth', 4, 0.10), ('depth', 5, 0.05), ('popularity', 6, 0.25)
),
s AS (SELECT (SELECT count(*) FROM spotify_tracks WHERE popularity IS NOT NULL) > 0 AS has_spotify)
SELECT component, sort_order,
       CASE WHEN s.has_spotify THEN weight
            WHEN component = 'popularity' THEN 0
            ELSE weight / 0.75 END AS weight
FROM base CROSS JOIN s;

CREATE OR REPLACE TABLE writer_scores AS
WITH m AS (
    SELECT as_of_year,
           (SELECT count(*) FROM spotify_tracks WHERE popularity IS NOT NULL) > 0 AS has_spotify
    FROM build_meta
),
per_rec AS (
    SELECT DISTINCT ws.writer_id, r.isrc
    FROM writer_shares ws
    JOIN releases r USING (work_id)
),
matched AS (
    SELECT pr.writer_id, st.popularity,
           row_number() OVER (PARTITION BY pr.writer_id ORDER BY st.popularity DESC) AS rn
    FROM per_rec pr
    JOIN spotify_tracks st USING (isrc)
    WHERE st.popularity IS NOT NULL
),
pop AS (
    -- top-3 average: rewards having hits without letting one fluke dominate
    SELECT writer_id,
           avg(popularity) FILTER (WHERE rn <= 3) AS top3_popularity,
           count(*)                               AS matched_tracks
    FROM matched
    GROUP BY writer_id
),
flagged AS (
    SELECT
        f.*,
        pop.top3_popularity,
        coalesce(pop.matched_tracks, 0) AS matched_tracks,
        CASE
            WHEN f.unpublished_works < f.works THEN 'has_publisher'
            WHEN regexp_matches(upper(f.display_name),
                 '\b(PUBLIC DOMAIN|TRADITIONAL|TRAD|ANONYMOUS|ANON|UNKNOWN|DP|COPYRIGHT CONTROL|PUBLISHING|PUBLISHER|PUBL|MUSIC|MUSICA|MUSIK|MUSIQUE|RECORDS|RECORDINGS|WRITER|WRITERS|LLC|INC|LTD|GMBH|PRODUCTION|PRODUCTIONS|ENTERTAINMENT|MEDIA|GROUP|SONGS|LIBRARY|STUDIO|STUDIOS|AUDIO|CATALOG|EDITION|EDITIONS)\b')
                THEN 'not_a_person'
            WHEN f.recordings < 3                         THEN 'insufficient_data'
            -- established before 2010: robust career start OR 3+ pre-2010 recordings
            -- (one stray old ISRC doesn't count, but a real back catalog does)
            WHEN f.career_start_year < 2010 OR f.pre2010_recordings >= 3 THEN 'legacy_catalog'
            WHEN f.last_year < m.as_of_year - 2           THEN 'inactive'
            WHEN f.works_per_active_year > 40             THEN 'high_volume_catalog'  -- library / content-farm output
        END AS exclusion_reason
    FROM writer_features f
    CROSS JOIN m
    LEFT JOIN pop USING (writer_id)
),
eligible AS (
    -- percentile rank (0-1) within the eligible pool, so components share a scale
    SELECT
        writer_id,
        percent_rank() OVER (ORDER BY distinct_artists)                                  AS p_reach,
        percent_rank() OVER (ORDER BY recent_recordings)                                 AS p_momentum,
        percent_rank() OVER (ORDER BY (recent_recordings + 1.0) / (prior_recordings + 1.0)) AS p_growth,
        percent_rank() OVER (ORDER BY published_cowrite_share)                           AS p_validation,
        percent_rank() OVER (ORDER BY works)                                             AS p_depth
    FROM flagged
    WHERE exclusion_reason IS NULL
),
pop_rank AS (
    SELECT writer_id, percent_rank() OVER (ORDER BY top3_popularity) AS p_popularity
    FROM flagged
    WHERE exclusion_reason IS NULL AND top3_popularity IS NOT NULL
),
w AS (
    SELECT
        max(weight) FILTER (WHERE component = 'reach')      AS w_reach,
        max(weight) FILTER (WHERE component = 'momentum')   AS w_momentum,
        max(weight) FILTER (WHERE component = 'validation') AS w_validation,
        max(weight) FILTER (WHERE component = 'growth')     AS w_growth,
        max(weight) FILTER (WHERE component = 'depth')      AS w_depth,
        max(weight) FILTER (WHERE component = 'popularity') AS w_popularity
    FROM score_weights
),
scored AS (
    SELECT
        fl.*,
        e.p_reach, e.p_momentum, e.p_growth, e.p_validation, e.p_depth,
        -- unmatched writers get a neutral 0.5 so they are neither rewarded nor punished
        CASE WHEN e.writer_id IS NOT NULL AND m.has_spotify THEN coalesce(pr.p_popularity, 0.5) END AS p_popularity,
        -- contribution of each component to the 0-100 score (these sum to the score)
        100 * w.w_reach      * e.p_reach      AS c_reach,
        100 * w.w_momentum   * e.p_momentum   AS c_momentum,
        100 * w.w_validation * e.p_validation AS c_validation,
        100 * w.w_growth     * e.p_growth     AS c_growth,
        100 * w.w_depth      * e.p_depth      AS c_depth,
        CASE WHEN e.writer_id IS NOT NULL
             THEN 100 * w.w_popularity * coalesce(pr.p_popularity, 0.5) END AS c_popularity
    FROM flagged fl
    CROSS JOIN m
    CROSS JOIN w
    LEFT JOIN eligible e USING (writer_id)
    LEFT JOIN pop_rank pr USING (writer_id)
)
SELECT
    *,
    round(c_reach + c_momentum + c_validation + c_growth + c_depth + c_popularity, 1) AS score,
    CASE WHEN exclusion_reason IS NULL THEN
        row_number() OVER (
            PARTITION BY exclusion_reason IS NULL
            ORDER BY c_reach + c_momentum + c_validation + c_growth + c_depth + c_popularity DESC,
                     recent_recordings DESC, writer_id)
    END AS rank
FROM scored;

-- Funnel counts (tiny), so /stats and /meta don't need the excluded writers' rows.
CREATE OR REPLACE TABLE writer_funnel AS
SELECT coalesce(exclusion_reason, 'eligible') AS status, count(*) AS writers
FROM writer_scores
GROUP BY ALL;
