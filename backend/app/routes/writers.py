from fastapi import APIRouter, Depends, HTTPException, Query

from app import db

router = APIRouter(tags=["writers"])


def get_con():
    # a cursor per request on the shared connection (DuckDB cursors are safe across threads)
    cur = db.shared_connection().cursor()
    try:
        yield cur
    finally:
        cur.close()


@router.get("/writers")
def top_writers(
    limit: int = Query(25, ge=1, le=500),
    min_works: int = Query(1, ge=1),
    q: str | None = Query(None, max_length=100, description="Filter by name (keeps global rank)"),
    con=Depends(get_con),
) -> list[dict]:
    """Top N eligible unpublished writers by score, with per-component contributions."""
    params = {"limit": limit, "min_works": min_works, "q": (q or "").strip() or None}
    return db.fetch_dicts(con, "queries/top_writers.sql", params)


@router.get("/writers/{writer_id}")
def writer_detail(writer_id: int, con=Depends(get_con)) -> dict:
    """One writer's full feature row plus their works/recordings."""
    rows = db.fetch_dicts(con, "queries/writer_detail.sql", {"writer_id": writer_id})
    if not rows:
        raise HTTPException(404, "writer not found")
    return {"writer": rows[0], "works": db.fetch_dicts(con, "queries/writer_works.sql", {"writer_id": writer_id})}


@router.get("/stats")
def stats(con=Depends(get_con)) -> list[dict]:
    """Funnel: how many writers each eligibility rule removed."""
    return db.fetch_dicts(con, "queries/stats.sql")


@router.get("/meta")
def meta(con=Depends(get_con)) -> dict:
    """Data snapshot date, pool sizes and the scoring weights in use."""
    info = db.fetch_dicts(con, "queries/meta.sql")[0]
    info["weights"] = db.fetch_dicts(con, "queries/weights.sql")
    return info
