-- Eligibility filters + composite score. Re-run after each Spotify enrichment.
-- See docs/DECISIONS.md for the reasoning behind every threshold and weight.

-- Single source of truth for weights (the API serves this table to the web client).
-- DSP presence is the Spotify layer: recordings found on Spotify, not play counts
-- (the Web API does not expose streams; Development Mode also dropped popularity).
-- Without any lookups, that slice is dropped and the rest are renormalized to 1.
CREATE OR REPLACE TABLE score_weights AS
WITH base(component, sort_order, weight) AS (
    VALUES ('reach', 1, 0.28), ('momentum', 2, 0.22), ('validation', 3, 0.18),
           ('growth', 4, 0.08), ('depth', 5, 0.06), ('dsp', 6, 0.18)
),
s AS (SELECT (SELECT count(*) FROM spotify_tracks) > 0 AS has_spotify)
SELECT component, sort_order,
       CASE WHEN s.has_spotify THEN weight
            WHEN component = 'dsp' THEN 0
            ELSE weight / 0.82 END AS weight
FROM base CROSS JOIN s;

CREATE OR REPLACE TABLE writer_scores AS
WITH m AS (
    SELECT as_of_year,
           (SELECT count(*) FROM spotify_tracks) > 0 AS has_spotify
    FROM build_meta
),
per_rec AS (
    SELECT DISTINCT ws.writer_id, r.isrc
    FROM writer_shares ws
    JOIN works w USING (work_id)
    JOIN releases r USING (work_id)
    WHERE NOT coalesce(w.in_dispute, false)
      AND (SELECT count(*) FROM spotify_tracks) > 0
),
dsp AS (
    SELECT
        pr.writer_id,
        count(*)                              AS looked_up_tracks,
        count(st.spotify_id)                  AS matched_tracks,
        nullif(array_to_string(list_distinct(flatten(
            list(string_split(st.genres, '|')) FILTER (WHERE st.genres IS NOT NULL AND st.genres <> '')
        )), ', '), '') AS spotify_genres
    FROM per_rec pr
    JOIN spotify_tracks st USING (isrc)
    GROUP BY pr.writer_id
),
flagged AS (
    SELECT
        f.*,
        coalesce(dsp.looked_up_tracks, 0) AS looked_up_tracks,
        coalesce(dsp.matched_tracks, 0)   AS matched_tracks,
        dsp.spotify_genres,
        CASE
            WHEN f.unpublished_works < f.works THEN 'has_publisher'
            WHEN f.works > 0 AND coalesce(f.bare_works, 0) = 0 THEN 'chain_ambiguous'
            WHEN regexp_matches(upper(f.display_name),
                 '\b(PUBLIC DOMAIN|TRADITIONAL|TRAD|ANONYMOUS|ANON|UNKNOWN|DP|COPYRIGHT CONTROL|PUBLISHING|PUBLISHER|PUBL|MUSIC|MUSICA|MUSIK|MUSIQUE|RECORDS|RECORDINGS|WRITER|WRITERS|LLC|INC|LTD|GMBH|PRODUCTION|PRODUCTIONS|ENTERTAINMENT|MEDIA|GROUP|SONGS|LIBRARY|STUDIO|STUDIOS|AUDIO|CATALOG|EDITION|EDITIONS)\b')
                THEN 'not_a_person'
            WHEN f.recordings < 3                         THEN 'insufficient_data'
            WHEN f.career_start_year < 2010 OR f.pre2010_recordings >= 3 THEN 'legacy_catalog'
            WHEN f.last_year < m.as_of_year - 2           THEN 'inactive'
            WHEN f.works_per_active_year > 40             THEN 'high_volume_catalog'
        END AS exclusion_reason
    FROM writer_features f
    CROSS JOIN m
    LEFT JOIN dsp USING (writer_id)
),
eligible AS (
    SELECT
        writer_id,
        percent_rank() OVER (ORDER BY distinct_artists)                                    AS p_reach,
        percent_rank() OVER (ORDER BY recent_recordings)                                   AS p_momentum,
        percent_rank() OVER (ORDER BY (recent_recordings + 1.0) / (prior_recordings + 1.0)) AS p_growth,
        percent_rank() OVER (ORDER BY published_cowrite_share)                             AS p_validation,
        percent_rank() OVER (ORDER BY works)                                               AS p_depth
    FROM flagged
    WHERE exclusion_reason IS NULL
),
dsp_rank AS (
    -- only writers we actually looked up; everyone else gets a neutral 0.5
    SELECT writer_id, percent_rank() OVER (ORDER BY matched_tracks) AS p_dsp
    FROM flagged
    WHERE exclusion_reason IS NULL AND looked_up_tracks > 0
),
w AS (
    SELECT
        max(weight) FILTER (WHERE component = 'reach')      AS w_reach,
        max(weight) FILTER (WHERE component = 'momentum')   AS w_momentum,
        max(weight) FILTER (WHERE component = 'validation') AS w_validation,
        max(weight) FILTER (WHERE component = 'growth')     AS w_growth,
        max(weight) FILTER (WHERE component = 'depth')      AS w_depth,
        max(weight) FILTER (WHERE component = 'dsp')        AS w_dsp
    FROM score_weights
),
scored AS (
    SELECT
        fl.*,
        e.p_reach, e.p_momentum, e.p_growth, e.p_validation, e.p_depth,
        CASE WHEN e.writer_id IS NOT NULL AND m.has_spotify THEN coalesce(dr.p_dsp, 0.5) END AS p_dsp,
        100 * w.w_reach      * e.p_reach      AS c_reach,
        100 * w.w_momentum   * e.p_momentum   AS c_momentum,
        100 * w.w_validation * e.p_validation AS c_validation,
        100 * w.w_growth     * e.p_growth     AS c_growth,
        100 * w.w_depth      * e.p_depth      AS c_depth,
        CASE WHEN e.writer_id IS NOT NULL
             THEN 100 * w.w_dsp * coalesce(dr.p_dsp, 0.5) END AS c_dsp
    FROM flagged fl
    CROSS JOIN m
    CROSS JOIN w
    LEFT JOIN eligible e USING (writer_id)
    LEFT JOIN dsp_rank dr USING (writer_id)
)
SELECT
    *,
    round(c_reach + c_momentum + c_validation + c_growth + c_depth + c_dsp, 1) AS score,
    CASE WHEN exclusion_reason IS NULL THEN
        row_number() OVER (
            PARTITION BY exclusion_reason IS NULL
            ORDER BY c_reach + c_momentum + c_validation + c_growth + c_depth + c_dsp DESC,
                     recent_recordings DESC, writer_id)
    END AS rank
FROM scored;

CREATE OR REPLACE TABLE writer_funnel AS
SELECT coalesce(exclusion_reason, 'eligible') AS status, count(*) AS writers
FROM writer_scores
GROUP BY ALL;
