-- Writer entity resolution + writer-side shares.
--
-- The same person can appear under several party_ids. IPI alone is NOT a safe key
-- (one IPI in this data is shared by 24 unrelated names).
-- Merge key is a sorted token fingerprint from full_name + first_name + last_name
-- (hyphens/punctuation dropped, Jr/Sr/II stripped). That joins
-- "ELVIN JESUS ROUBERT-RODRIGUEZ" to "ELVIN JESUS ROUBERT RODRIGUEZ" and
-- "Smith, Alice" to "ALICE SMITH" without a nickname map.
-- IPI still only *separates* different people who share a fingerprint.
-- Rules for writer_key:
--   has IPI                         -> fp | ipi
--   no IPI, fp has exactly 1 IPI    -> attach to that person
--   no IPI, fp never has an IPI     -> fp |
--   no IPI, fp has 2+ IPIs          -> keep separate (ambiguous)

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
        p.first_name,
        p.last_name,
        p.ipi_name_number,
        array_to_string(
            list_sort(list_distinct(
                list_filter(
                    string_split(
                        trim(regexp_replace(
                            regexp_replace(
                                regexp_replace(
                                    regexp_replace(
                                        upper(concat_ws(' ', p.full_name, p.first_name, p.last_name)),
                                        '^ARR\.?\s+', ''),
                                    '\b(MR|MRS|MS|JR|SR|II|III|IV)\b', ' ', 'g'),
                                '[[:punct:]]+', ' ', 'g'),
                            '\s+', ' ', 'g')),
                        ' '),
                    x -> x <> '')
            )),
            ' ') AS name_fp
    FROM parties p
    JOIN writer_party_ids USING (party_id)
),
name_ipis AS (
    SELECT name_fp,
           count(DISTINCT ipi_name_number) AS n_ipi,
           max(ipi_name_number)            AS sole_ipi
    FROM p
    GROUP BY name_fp
),
keyed AS (
    SELECT
        p.*,
        CASE
            WHEN coalesce(p.name_fp, '') = ''     THEN 'party|' || p.party_id::VARCHAR
            WHEN p.ipi_name_number IS NOT NULL    THEN p.name_fp || '|' || p.ipi_name_number
            WHEN n.n_ipi = 1                      THEN p.name_fp || '|' || n.sole_ipi
            WHEN n.n_ipi = 0                      THEN p.name_fp || '|'
            ELSE 'party|' || p.party_id::VARCHAR
        END AS writer_key
    FROM p
    LEFT JOIN name_ipis n USING (name_fp)
)
SELECT *, dense_rank() OVER (ORDER BY writer_key) AS writer_id
FROM keyed;

CREATE OR REPLACE TABLE writers AS
SELECT
    writer_id,
    coalesce(
        arg_max(
            nullif(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), ''),
            (ipi_name_number IS NOT NULL)::INT),
        arg_max(full_name, (ipi_name_number IS NOT NULL)::INT),
        mode(full_name)
    ) AS display_name,
    max(ipi_name_number) AS ipi_name_number,
    bool_or(first_name IS NOT NULL OR last_name IS NOT NULL) AS has_person_name,
    list(party_id ORDER BY party_id) AS party_ids
FROM writer_parties
GROUP BY writer_id;

-- Every writer-side share, flagged published / unpublished.
-- Shares chain via preceding_id: writer -> OriginalPublisher -> RightsAdministrator.
-- The dump stores multiple targets in one field ("id|id"). ~233k publisher rows
-- do that; an equality join misses them. ~633k publisher rows point at nobody —
-- if that work has exactly one unlinked writer, that is the missing chain, not
-- an unsigned catalog. If a publisher row has a real percentage and points at
-- nobody on a *multi*-writer work, the dump lost the pointer. Treat every
-- unlinked writer on that work as published — better to miss an unsigned
-- cowriter on a messy hit than pitch someone whose share is the unallocated slice.
CREATE OR REPLACE TABLE writer_shares AS
WITH publisher_links AS (
    SELECT DISTINCT trim(x) AS preceding_id
    FROM shares,
         unnest(string_split(coalesce(preceding_id, ''), '|')) AS u(x)
    WHERE party_role IN ('OriginalPublisher', 'SubstitutedPublisher')
      AND trim(x) <> ''
),
linked AS (
    SELECT
        s.share_id,
        s.work_id,
        s.party_id,
        wp.writer_id,
        s.party_role,
        s.share_percentage,
        (pl.preceding_id IS NOT NULL) AS linked
    FROM shares s
    JOIN writer_parties wp USING (party_id)
    LEFT JOIN publisher_links pl ON pl.preceding_id = s.share_id
    WHERE s.party_role IN ('Composer', 'ComposerLyricist', 'Lyricist', 'Arranger',
                           'Adapter', 'SubLyricist', 'Translator', 'SubArranger')
),
orphan_works AS (
    SELECT DISTINCT work_id
    FROM shares
    WHERE party_role IN ('OriginalPublisher', 'SubstitutedPublisher')
      AND (preceding_id IS NULL OR preceding_id = '')
),
sole_unlinked AS (
    SELECT work_id
    FROM linked
    WHERE NOT linked
    GROUP BY work_id
    HAVING count(*) = 1
),
-- Publisher collected a real share but preceding_id is blank. Not 0% placeholder rows.
residual_works AS (
    SELECT DISTINCT work_id
    FROM shares
    WHERE party_role IN ('OriginalPublisher', 'SubstitutedPublisher')
      AND (preceding_id IS NULL OR preceding_id = '')
      AND coalesce(share_percentage, 0) > 0
)
SELECT
    share_id, work_id, party_id, writer_id, party_role, share_percentage,
    linked
    OR (NOT linked AND work_id IN (SELECT work_id FROM sole_unlinked)
                     AND work_id IN (SELECT work_id FROM orphan_works))
    OR (NOT linked AND work_id IN (SELECT work_id FROM residual_works)) AS is_published
FROM linked;
