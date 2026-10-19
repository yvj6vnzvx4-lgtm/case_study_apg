# Design decisions

## Data
- **Parquet over the provided DuckDB file.** Same rows; the .duckdb is 4.2 GB uncompacted vs 127 MB
  parquet. `make db` rebuilds a ~350 MB DuckDB with only the columns we use.
- **Dropped constant/empty columns:** territory_code (always US), use_type (always Stream),
  validity_end_date (always NULL).
- **Snapshot date.** Latest release is 2025-02-14, so "recent" is anchored on the data
  (`build_meta.as_of_year` = 2024), not on today's date. Otherwise every writer looks inactive.
- **Recording year from the ISRC.** ISRCs embed a registration year (CC-XXX-**YY**-NNNNN). It exists on
  every recording, while release_date is missing on ~52% and is often a later reissue/compilation date
  (33% of dated rows are 2+ years after the ISRC year). Falls back to release_date if the ISRC is malformed.
- **Cleaning:** sentinel dates (0001-01-01, 9999-12-31) → NULL; IDs embedded in names
  ("LARRY 260858648 FRICKE") stripped.

## Writer identity (entity resolution)
- Same person appears under several party_ids. **IPI alone is not a safe key**: one IPI in the data is
  shared by 24 unrelated names (a default/junk value).
- Rule: merge on normalized name; use IPI to *separate* different people with the same name.
  A no-IPI party attaches to the IPI holder of the same name if there is exactly one.
  ~59K writers are merged from ~120K party records.
- Known trade-off: two different no-IPI people with a common name can be merged. The detail endpoint
  returns `party_ids` so a scout can check.

## Definition of "unpublished"
- Shares chain through `preceding_id`: writer → OriginalPublisher → RightsAdministrator.
- A writer share is published if a publisher share points back to it.
- A writer is **unpublished** only if *none* of their works has a publisher link (strict). Signing
  someone who already has a publisher on part of their catalog is a different conversation.
- Limitation: this is US streaming shares only. "Unpublished in this data" ≠ unsigned. The top of our
  list includes known hitmakers (e.g., Lil Nas X's and Post Malone's co-writers) whose deals simply
  aren't in this snapshot, so a human check is still needed.

## Eligibility funnel (`GET /stats`)
Applied in order; each excluded writer keeps a reason, so nothing disappears silently.

| Rule | Why |
|---|---|
| `has_publisher` | not a signing candidate |
| `not_a_person` | names like PUBLIC DOMAIN, TRADITIONAL, …PUBLISHING, …MUSIC, LLC |
| `insufficient_data` (< 3 recordings) | not enough evidence to rank |
| `legacy_catalog` (career start < 2010, or 3+ pre-2010 recordings) | catches Mozart / standards / established careers. Career start = 10th-percentile recording year, so one stray old ISRC or same-name merge doesn't trigger it |
| `inactive` (nothing in the last 3 data years) | want writers who are working now |
| `high_volume_catalog` (> 40 works per active year) | content farms / functional-music catalogs (e.g. 450+ "sleep/chill" tracks in 2 years) |

Result on the full data: 658K writers → ~19.8K eligible.

## Scoring
There is no streaming or chart data in the bundle, so "recording performance" has to be inferred.
Spotify was the obvious source, but **in Feb–Mar 2026 Spotify removed `popularity` from the Web API
for Development Mode apps** (along with artist followers and the batch track endpoint). The provided
keys are almost certainly dev-mode, so the score is built from signals inside the data, with Spotify
as an optional layer.

Each component is a **percentile rank within the eligible pool** (0–1), so components with very
different scales (artist counts vs. ratios) are comparable and outliers don't dominate.

| Component | Signal | Weight (with Spotify) | Weight (catalog-only) |
|---|---|---|---|
| Reach | distinct artists who recorded their songs | 0.25 | 0.33 |
| Momentum | recordings in the last 2 data years | 0.20 | 0.27 |
| Validation | share of songs co-written with *published* writers | 0.15 | 0.20 |
| Growth | (recent 2y + 1) / (prior 2y + 1) | 0.10 | 0.13 |
| Depth | number of works | 0.05 | 0.07 |
| Popularity | avg Spotify popularity of top-3 tracks | 0.25 | — |

Why these:
- **Reach** is the strongest "performance" proxy available: every artist who cuts a writer's song is
  an industry decision in their favor. It also rewards range over one artist's album.
- **Momentum + growth**: publishers sign trajectories, not back catalogs. Growth is smoothed (+1) so
  1→2 recordings doesn't look like 100% growth, and has a lower weight because it's noisy.
- **Validation**: co-writing with signed writers means they're already in professional sessions.
  It's also the closest thing to a "who else rates them" signal in the data.
- **Depth** is a light tiebreaker; volume alone is not quality (that's what the farm filter is for).
- **Popularity** (if available): top-3 average rewards having hits without one fluke dominating.
  Writers we didn't look up get a neutral 0.5, so they're neither helped nor hurt.

Two-stage ranking so we don't call Spotify ~1.6M times: rank everyone on catalog signals, then
`make enrich` looks up only the top-N writers' ISRCs, caches them in `spotify_tracks`, and rescores.

## Stack
- Python + FastAPI + DuckDB; raw SQL in `backend/sql/` (no ORM), named parameters only.
- React (Vite) web client, plain CSS, no UI library (small surface, nothing to explain away).

## Web client
- **Split bar per writer.** Each row shows how the score is built: one colored segment per factor,
  sized by its contribution. Publishing people read split sheets every day; this reads the same way,
  and it answers "why is this person ranked here?" without opening anything.
- **Weights come from the API** (`/meta` → `score_weights` table), so the UI never hard-codes them and
  the legend updates automatically if Spotify popularity is added.
- **Funnel bar** at the top makes the filtering visible: 658K writers → ~19.8K ranked, with each rule's count.
- **Detail panel** translates each percentile into plain language ("22 different artists have recorded
  their songs. Top 1% of ranked writers."), lists songs and the artists who cut them, and reminds the
  scout to confirm deal status before reaching out.
- **Search keeps the global rank** (computed in SQL), so searching a name tells you where they stand overall.
- CSV export for taking a shortlist into a meeting; responsive layout with a bottom sheet on phones.
- Tests (25) run the real SQL pipeline on a fixture with one fake writer per rule, and check exact
  scores, so a change to weights or filters breaks a test on purpose.

## Hosting
- **Build offline, serve a snapshot.** The full DuckDB is ~400 MB, too big for a serverless function
  and mostly rows the site never shows. `make serving` exports only the ranked writers and their
  songs/recordings to ~5.5 MB of zstd parquet, committed to the repo.
- The hosted API opens an in-memory DuckDB with one view per parquet file and runs the **same SQL
  files** as local. A test exports a snapshot from the fixture and asserts every endpoint returns
  identical JSON from both, so the two can't drift.
- One Vercel project: static Vite build plus a Python function at `/api`. The backend lives in
  `backend/` because Vercel turns every `.py` under `api/` into its own function.
- Trade-off: data refreshes need a rebuild + redeploy. Fine for a weekly catalog snapshot; see the
  realtime bonus answer for what changes when it isn't.

## Bonus questions
- **Realtime ranking:** TODO
- **Metric other than catalog success:** TODO
