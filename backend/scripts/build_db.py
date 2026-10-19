"""Build data/writers.duckdb from the raw parquet files."""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import config, db, pipeline  # noqa: E402


def main() -> None:
    config.DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    t = time.time()
    con = db.connect(read_only=False)
    pipeline.build(con, config.PARQUET_DIR)
    con.execute("CHECKPOINT")
    n = con.execute("SELECT count(*) FROM writer_scores").fetchone()[0]
    print(f"built {config.DB_PATH} ({n:,} writers) in {time.time() - t:.1f}s")


if __name__ == "__main__":
    main()
