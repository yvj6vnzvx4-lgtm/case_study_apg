# Writer Scout

Ranks the top N **unpublished songwriters** for prospective signings, using recording activity
(who is cutting their songs, how recently, who they write with) and, when available, Spotify popularity.

APG case study. Design decisions and trade-offs: [`docs/DECISIONS.md`](docs/DECISIONS.md).

## Layout
```
backend/
  app/            FastAPI app, DuckDB helpers, Spotify client
  sql/build/      pipeline: load → writers + shares → features → spotify cache → scores
  sql/queries/    read queries used by the API (raw SQL, named parameters)
  sql/export/     compact serving snapshot for the hosted API
  scripts/        build_db.py, export_serving.py, enrich_spotify.py
  serving/        committed parquet snapshot (~5.5 MB, ranked writers only)
  tests/          pytest; runs the real SQL on a fixture with one fake writer per rule
web/              React (Vite) client
api/index.py      Vercel entry point (mounts the backend under /api)
docs/DECISIONS.md design decisions + bonus answers
data/             full built DB (gitignored)
```

## Run locally
Needs Python 3.10+, [uv](https://docs.astral.sh/uv/), Node 18+, and the case-study parquet files
in `../data/parquet/` (or set `PARQUET_DIR` in `.env`).

```bash
cp .env.example .env          # optional: Spotify credentials
make setup                    # Python deps (uv) + npm install
make db                       # build data/writers.duckdb from parquet (~1 min)
make serving                  # refresh backend/serving/ snapshot
make enrich                   # optional: Spotify lookups for the shortlist, then rescore
make api                      # http://localhost:8000/docs
make web                      # http://localhost:5173
make test
```
Without `data/writers.duckdb`, the API falls back to the committed `backend/serving/` snapshot,
so `make api` + `make web` works straight after cloning.

## API
| Method | Path | Description |
|---|---|---|
| GET | `/health` | liveness |
| GET | `/writers?limit=25&min_works=1&q=` | top N unpublished writers, with per-factor contributions |
| GET | `/writers/{writer_id}` | full feature row + songs and recordings |
| GET | `/stats` | eligibility funnel (how many writers each rule removed) |
| GET | `/meta` | data snapshot date, pool sizes, scoring weights |

Hosted: the same routes are served under `/api` (e.g. `/api/writers`).

## Hosting
One Vercel project: the Vite build is served as static files and `api/index.py` runs the FastAPI
app as a Python function, reading the parquet snapshot with in-memory DuckDB (stateless, read-only).
