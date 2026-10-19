-- Top N eligible unpublished writers with per-component contributions.
-- `rank` is the global rank, so it stays correct when a name search filters the list.
SELECT
    rank, writer_id, display_name, ipi_name_number, works, recordings, distinct_artists,
    recent_recordings, prior_recordings, recent_artists, first_year, career_start_year, last_year,
    works_with_published_cowriter, round(published_cowrite_share, 3) AS published_cowrite_share,
    top3_popularity, score,
    round(c_reach, 2) AS c_reach, round(c_momentum, 2) AS c_momentum,
    round(c_validation, 2) AS c_validation, round(c_growth, 2) AS c_growth,
    round(c_depth, 2) AS c_depth, round(c_popularity, 2) AS c_popularity
FROM writer_scores
WHERE exclusion_reason IS NULL
  AND works >= $min_works
  AND ($q IS NULL OR display_name ILIKE '%' || $q || '%')
ORDER BY rank
LIMIT $limit;
