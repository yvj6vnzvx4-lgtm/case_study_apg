-- Export a compact, read-only serving snapshot: only what the API needs to show
-- ranked writers (~20K of 658K). The hosted API queries these parquet files directly.
-- {out_dir} is filled in by scripts/export_serving.py.

CREATE OR REPLACE TEMP TABLE ranked AS
SELECT writer_id FROM writer_scores WHERE exclusion_reason IS NULL;

CREATE OR REPLACE TEMP TABLE ranked_works AS
SELECT DISTINCT work_id FROM writer_shares WHERE writer_id IN (SELECT writer_id FROM ranked);

COPY build_meta    TO '{out_dir}/build_meta.parquet'    (FORMAT parquet);
COPY score_weights TO '{out_dir}/score_weights.parquet' (FORMAT parquet);
COPY writer_funnel TO '{out_dir}/writer_funnel.parquet' (FORMAT parquet);

COPY (SELECT * FROM writer_scores WHERE exclusion_reason IS NULL ORDER BY rank)
  TO '{out_dir}/writer_scores.parquet' (FORMAT parquet, COMPRESSION zstd);

COPY (SELECT * FROM writer_shares WHERE writer_id IN (SELECT writer_id FROM ranked) ORDER BY writer_id)
  TO '{out_dir}/writer_shares.parquet' (FORMAT parquet, COMPRESSION zstd);

COPY (SELECT * FROM works WHERE work_id IN (SELECT work_id FROM ranked_works))
  TO '{out_dir}/works.parquet' (FORMAT parquet, COMPRESSION zstd);

COPY (SELECT * FROM releases WHERE work_id IN (SELECT work_id FROM ranked_works) ORDER BY work_id)
  TO '{out_dir}/releases.parquet' (FORMAT parquet, COMPRESSION zstd);

COPY (SELECT * FROM spotify_tracks WHERE isrc IN (
        SELECT isrc FROM releases WHERE work_id IN (SELECT work_id FROM ranked_works)))
  TO '{out_dir}/spotify_tracks.parquet' (FORMAT parquet);
