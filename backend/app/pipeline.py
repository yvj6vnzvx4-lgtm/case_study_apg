"""Build steps shared by scripts/build_db.py and the tests."""
from pathlib import Path

import duckdb

from app import config, db

BUILD_STEPS = sorted(p.name for p in (config.SQL_DIR / "build").glob("*.sql"))


def build(con: duckdb.DuckDBPyConnection, parquet_dir: Path | str) -> None:
    for step in BUILD_STEPS:
        db.run_script(con, f"build/{step}", parquet_dir=str(parquet_dir))


def rescore(con: duckdb.DuckDBPyConnection) -> None:
    db.run_script(con, "build/05_scores.sql")
