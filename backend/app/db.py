"""Thin DuckDB layer. All data access is raw SQL kept in backend/sql/ (no ORM)."""
import threading
from pathlib import Path

import duckdb

from app import config

_shared: duckdb.DuckDBPyConnection | None = None
_lock = threading.Lock()


def connect(path: Path | str | None = None, read_only: bool = True) -> duckdb.DuckDBPyConnection:
    return duckdb.connect(str(path or config.DB_PATH), read_only=read_only)


def connect_serving(serving_dir: Path = config.SERVING_DIR) -> duckdb.DuckDBPyConnection:
    """In-memory DuckDB with one view per snapshot parquet file (stateless, nothing to write)."""
    con = duckdb.connect(":memory:", config={"home_directory": "/tmp", "temp_directory": "/tmp"})
    for f in sorted(serving_dir.glob("*.parquet")):
        con.execute(f"CREATE VIEW {f.stem} AS SELECT * FROM read_parquet('{f.as_posix()}')")
    return con


def shared_connection() -> duckdb.DuckDBPyConnection:
    """One connection per process: the full DB if it exists locally, else the serving snapshot."""
    global _shared
    with _lock:
        if _shared is None:
            _shared = connect(read_only=True) if config.DB_PATH.exists() else connect_serving()
        return _shared


def load_sql(name: str) -> str:
    """Read a .sql file from backend/sql (e.g. 'queries/top_writers.sql')."""
    return (config.SQL_DIR / name).read_text()


def run_script(con: duckdb.DuckDBPyConnection, name: str, **template_vars: str) -> None:
    """Run a multi-statement build script. {placeholders} are filled from template_vars
    (only used for trusted values like file paths, never user input)."""
    con.execute(load_sql(name).format(**template_vars))


def fetch_dicts(con: duckdb.DuckDBPyConnection, name: str, params: dict | None = None) -> list[dict]:
    """Run a read query with DuckDB named parameters ($name) and return rows as dicts."""
    cur = con.execute(load_sql(name), params or {})
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, row)) for row in cur.fetchall()]
