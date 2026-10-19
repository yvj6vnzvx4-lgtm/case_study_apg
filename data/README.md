# Data

Not committed. Raw inputs come from the case-study bundle:

- `../data/parquet/{works,releases,parties,shares}.parquet` (127 MB)

`make db` builds a compact, indexed `data/writers.duckdb` from those files.
(The provided `writers.duckdb` is 4.2 GB but has the same rows as the parquet;
it was never compacted, so we rebuild from parquet instead.)
