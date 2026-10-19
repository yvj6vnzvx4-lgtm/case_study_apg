-- Load raw parquet into compact, typed tables.
-- Drops constant columns (territory_code = 'US', use_type = 'Stream' everywhere)
-- and empty ones (validity_end_date is always NULL).
-- {parquet_dir} is filled in by app/pipeline.py.

CREATE OR REPLACE TABLE parties AS
SELECT
    id AS party_id,
    ipi_name_number,
    cisac_society_id,
    -- some names have IDs baked in, e.g. 'LARRY 260858648 FRICKE'
    trim(regexp_replace(full_name, '\s*[0-9][0-9][0-9][0-9][0-9][0-9]+\s*', ' ', 'g')) AS full_name
FROM read_parquet('{parquet_dir}/parties.parquet');

CREATE OR REPLACE TABLE works AS
SELECT id AS work_id, iswc, title, in_dispute
FROM read_parquet('{parquet_dir}/works.parquet');

CREATE OR REPLACE TABLE shares AS
SELECT id AS share_id, work_id, party_id, party_role,
       share_percentage, preceding_id, validity_start_date
FROM read_parquet('{parquet_dir}/shares.parquet');

CREATE OR REPLACE TEMP TABLE releases_raw AS
SELECT
    work_id,
    isrc,
    artist_name,
    -- junk sentinel dates (0001-01-01, 9999-12-31) become NULL
    CASE WHEN release_date BETWEEN DATE '1900-01-01' AND current_date + INTERVAL 1 YEAR
         THEN release_date END AS release_date,
    try_cast(substr(isrc, 6, 2) AS INTEGER) AS isrc_yy
FROM read_parquet('{parquet_dir}/releases.parquet');

-- The data is a snapshot; "recent" is measured from its end, not from today.
-- as_of_year = last year with a full-ish year of data (snapshot ends Feb 2025 -> 2024).
CREATE OR REPLACE TABLE build_meta AS
SELECT
    max(release_date) AS as_of,
    year(max(release_date)) - CASE WHEN month(max(release_date)) < 6 THEN 1 ELSE 0 END AS as_of_year
FROM releases_raw;

-- recording_year: the year embedded in the ISRC (CC-XXX-YY-NNNNN) = when the recording
-- was registered. Present on every row, unlike release_date (~48%), and release_date is
-- often a later reissue/compilation date. Falls back to release_date if the ISRC is malformed.
CREATE OR REPLACE TABLE releases AS
SELECT
    r.work_id,
    r.isrc,
    r.artist_name,
    upper(trim(r.artist_name)) AS artist_key,
    r.release_date,
    coalesce(
        CASE WHEN r.isrc_yy IS NULL OR length(r.isrc) <> 12 THEN NULL
             WHEN 2000 + r.isrc_yy <= m.as_of_year + 1 THEN 2000 + r.isrc_yy
             ELSE 1900 + r.isrc_yy END,
        year(r.release_date)
    ) AS recording_year
FROM releases_raw r CROSS JOIN build_meta m;

DROP TABLE releases_raw;
