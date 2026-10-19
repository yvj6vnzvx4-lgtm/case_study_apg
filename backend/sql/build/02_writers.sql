-- Writer entity resolution + writer-side shares.
--
-- The same person can appear under several party_ids. IPI alone is NOT a safe merge key
-- (one IPI in this data is shared by 24 unrelated names), so:
--   * merge parties with the same normalized name, and
--   * use IPI only to keep apart different people who share a name.
-- Rules for writer_key:
--   has IPI                         -> name | ipi
--   no IPI, name has exactly 1 IPI  -> attach to that person (name | that ipi)
--   no IPI, name never has an IPI   -> name |            (merge by name alone)
--   no IPI, name has 2+ IPIs        -> keep separate (ambiguous)

CREATE OR REPLACE TABLE writer_parties AS
WITH writer_party_ids AS (
    SELECT DISTINCT party_id
    FROM shares
    WHERE party_role IN ('Composer', 'ComposerLyricist', 'Lyricist', 'Arranger',
                         'Adapter', 'SubLyricist', 'Translator', 'SubArranger')
),
p AS (
    SELECT
        p.party_id,
        p.full_name,
        p.ipi_name_number,
        trim(regexp_replace(
            regexp_replace(regexp_replace(upper(p.full_name), '^ARR\.?\s+', ''), '[[:punct:]]', ' ', 'g'),
            '\s+', ' ', 'g')) AS norm_name
    FROM parties p
    JOIN writer_party_ids USING (party_id)
),
name_ipis AS (
    SELECT norm_name,
           count(DISTINCT ipi_name_number) AS n_ipi,
           max(ipi_name_number)            AS sole_ipi
    FROM p
    GROUP BY norm_name
),
keyed AS (
    SELECT
        p.*,
        CASE
            WHEN coalesce(p.norm_name, '') = ''   THEN 'party|' || p.party_id::VARCHAR
            WHEN p.ipi_name_number IS NOT NULL    THEN p.norm_name || '|' || p.ipi_name_number
            WHEN n.n_ipi = 1                      THEN p.norm_name || '|' || n.sole_ipi
            WHEN n.n_ipi = 0                      THEN p.norm_name || '|'
            ELSE 'party|' || p.party_id::VARCHAR
        END AS writer_key
    FROM p
    LEFT JOIN name_ipis n USING (norm_name)
)
SELECT *, dense_rank() OVER (ORDER BY writer_key) AS writer_id
FROM keyed;

CREATE OR REPLACE TABLE writers AS
SELECT
    writer_id,
    mode(full_name)                    AS display_name,
    max(ipi_name_number)               AS ipi_name_number,
    list(party_id ORDER BY party_id)   AS party_ids
FROM writer_parties
GROUP BY writer_id;

-- Every writer-side share, flagged published / unpublished.
-- Shares chain via preceding_id: writer -> OriginalPublisher -> RightsAdministrator.
-- A writer share is "published" if some publisher share points back to it.
CREATE OR REPLACE TABLE writer_shares AS
WITH publisher_links AS (
    SELECT DISTINCT preceding_id
    FROM shares
    WHERE party_role IN ('OriginalPublisher', 'SubstitutedPublisher')
      AND preceding_id IS NOT NULL
)
SELECT
    s.share_id,
    s.work_id,
    s.party_id,
    wp.writer_id,
    s.party_role,
    s.share_percentage,
    (pl.preceding_id IS NOT NULL) AS is_published
FROM shares s
JOIN writer_parties wp USING (party_id)
LEFT JOIN publisher_links pl ON pl.preceding_id = s.share_id
WHERE s.party_role IN ('Composer', 'ComposerLyricist', 'Lyricist', 'Arranger',
                       'Adapter', 'SubLyricist', 'Translator', 'SubArranger');
