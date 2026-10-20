# Writer Scout

Ranks the top N **unpublished songwriters** for prospective signings, using recording activity
(who is cutting their songs, how recently, who they write with) and, when looked up, whether
those recordings exist on Spotify (plus genres and listen links — not stream counts).

**Live:** [casestudyapg.vercel.app](https://casestudyapg.vercel.app) (no auth). US streaming shares through February 2025: **646,889** writers in, **486** ranked.

APG case study. Design decisions, funnel, and bonus answers: [`docs/DECISIONS.md`](docs/DECISIONS.md).

## Layout
```
backend/
  app/            FastAPI app, DuckDB helpers, Spotify client
  sql/build/      pipeline: load → writers + shares → features → spotify cache → scores
  sql/queries/    read queries used by the API (raw SQL, named parameters)
  sql/export/     compact serving snapshot for the hosted API
  scripts/        build_db.py, export_serving.py, enrich_spotify.py
  serve.py        entrypoint: the API mounted under /api (local and Vercel)
  serving/        committed parquet snapshot (~0.2 MB, ranked writers only)
  tests/          pytest (36); runs the real SQL on a fixture with one fake writer per rule
web/              React (Vite) client
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
make api                      # http://localhost:8000/api/docs
make web                      # http://localhost:5173 (proxies /api to make api)
make test
```
Without `data/writers.duckdb`, the API falls back to the committed `backend/serving/` snapshot,
so `make api` + `make web` works straight after cloning.

## API
| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | liveness |
| GET | `/api/writers?limit=25&min_works=1&q=` | top N unpublished writers, with per-factor contributions |
| GET | `/api/writers/{writer_id}` | full feature row + songs and recordings |
| GET | `/api/stats` | eligibility funnel (how many writers each rule removed) |
| GET | `/api/meta` | data snapshot date, pool sizes, scoring weights |

## Hosting
Public app: [https://casestudyapg.vercel.app](https://casestudyapg.vercel.app)

One Vercel project with two [services](https://vercel.com/docs/services) (see `vercel.json`):

| Service | Root | Public path | What it is |
|---|---|---|---|
| `backend` | `backend/` | `/api/*` | FastAPI (`serve:app`), reads the parquet snapshot with in-memory DuckDB |
| `web` | `web/` | everything else | Vite static build |

The browser calls `/api` on the same domain, so there are no service-to-service calls and no bindings.
`vercel dev` runs both together locally.
