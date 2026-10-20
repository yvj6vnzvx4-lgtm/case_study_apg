# Design decisions

## Data
- **Parquet over the provided DuckDB file.** Same rows; the .duckdb is 4.2 GB uncompacted vs 127 MB
  parquet. `make db` rebuilds a ~350 MB DuckDB with only the columns we use.
- **Dropped constant/empty columns:** territory_code (always US), use_type (always Stream),
  validity_end_date (always NULL), cisac_society_id (always NULL). `share_percentage` is
  unused on writer roles (always NULL); kept on the share row for publisher-side work.
- **Loaded and used:** `first_name` / `last_name` (identity fingerprint + display),
  `in_dispute` (exclude from score, still show on the writer).
- **Snapshot date.** Latest release is 2025-02-14, so "recent" is anchored on the data
  (`build_meta.as_of_year` = 2024), not on today's date. Otherwise every writer looks inactive.
- **Recording year from the ISRC.** ISRCs embed a registration year (CC-XXX-**YY**-NNNNN). It exists on
  every recording, while release_date is missing on ~52% and is often a later reissue/compilation date
  (33% of dated rows are 2+ years after the ISRC year). Falls back to release_date if the ISRC is malformed.
- **Cleaning:** sentinel dates (0001-01-01, 9999-12-31) → NULL; IDs embedded in names
  ("LARRY 260858648 FRICKE") stripped. Artist credits are normalized (punctuation / `feat.`)
  and **one artist key per ISRC**; karaoke / "various artists" / Kidz Bop strings are dropped
  from reach so the same commercial cut is not counted as five different artists.
- **Reach is a recording-activity proxy, not fame.** Hits without a publisher chain in this
  US-stream snapshot still rank (Ryan Tedder fragments, Latin session writers). "Unpublished
  here" is not the same as unsigned.

## Writer identity (entity resolution)
- Same person appears under several party_ids. **IPI alone is not a safe key**: one IPI in the data is
  shared by 24 unrelated names (a default/junk value).
- Rule: merge on a **sorted token fingerprint** of `full_name` + `first_name` + `last_name`
  (punctuation/hyphens dropped, Jr/Sr/II stripped). IPI *separates* different people who
  share a fingerprint. A no-IPI party attaches to the IPI holder of that fingerprint if
  there is exactly one. This joins inverted names (`Smith, Alice`) and hyphen vs space
  (`ROUBERT-RODRIGUEZ`) without a nickname list — Billy/William stay two people.
- Do **not** merge on last+first alone: Elvin’s two registry rows split the compound
  surname differently (`RODRIGUEZ` vs `ROUBERT-RODRIGUEZ`).
- Missing first+last is common on companies and on 58 real writer names; it is not
  `not_a_person` by itself. Display prefers `first_name` + `last_name` from the IPI row.
- Known trade-off: two different no-IPI people with the same token set can be merged.
  The detail endpoint returns `party_ids` so a scout can check.

## Definition of "unpublished"
- Shares chain through `preceding_id`: writer → OriginalPublisher → RightsAdministrator.
- A writer share is published if a publisher share points back to it.
- A writer is **unpublished** only if *none* of their works has a publisher link (strict), after
  two repairs the dump needs: split `preceding_id` on `|` (233k rows), and if a work has an
  OriginalPublisher with a blank `preceding_id` and exactly one unlinked writer, attach it.
  If a publisher row has a **real percentage** and still points at nobody on a multi-writer
  work, attach it to every unlinked writer on that song (the dump lost the pointer; the
  unallocated slice is the deal). Signing someone who already has a publisher on part of
  their catalog is a different conversation.
- Limitation: this is US streaming shares only. "Unpublished in this data" ≠ unsigned. A human
  still confirms deal status.
- **Disputed works** (`in_dispute`, ~12.7k): listed on the writer with a flag, excluded from
  reach / eligibility. A fight over the registration is not a cut.

## Eligibility funnel (`GET /stats`)
Applied in order; each excluded writer keeps a reason, so nothing disappears silently.

| Rule | Why |
|---|---|
| `has_publisher` | not a signing candidate. Includes deals stored as `id|id`, a blank preceding_id on a sole writer, or an unallocated publisher percentage on a multi-writer work |
| `chain_ambiguous` | every work already has an OriginalPublisher on the *song*, but none of those rows point at this writer. The dump cannot tell unsigned cowriter from a missing pointer (Botlok / Elvin). Not a name filter |
| `not_a_person` | names like PUBLIC DOMAIN, TRADITIONAL, …PUBLISHING, …MUSIC, LLC |
| `insufficient_data` (< 3 commercial recordings) | karaoke / tribute / piano-channel credits do not count |
| `legacy_catalog` (career start < 2010, or 3+ pre-2010 recordings) | catches Mozart / standards / established careers. Career start = 10th-percentile recording year, so one stray old ISRC or same-name merge doesn't trigger it |
| `inactive` (nothing in the last 3 data years) | want writers who are working now |
| `high_volume_catalog` (> 40 works per active year) | content farms / functional-music catalogs (e.g. 450+ "sleep/chill" tracks in 2 years) |

## Scoring
There is no streaming or chart data in the bundle, so "recording performance" has to be inferred.
Spotify was the obvious source, but the Web API **does not expose stream counts**, and Development
Mode apps lost `popularity`, artist `followers`/`genres`, and batch track fetches in Feb–Mar 2026. The score
is built from catalog signals, with Spotify as an optional **presence** layer (is the recording
in the catalog?), plus genres and listen links for the scout — not play counts.

Each component is a **percentile rank within the eligible pool** (0–1), so components with very
different scales (artist counts vs. ratios) are comparable and outliers don't dominate.

| Component | Signal | Weight (with Spotify lookups) | Weight (catalog-only) |
|---|---|---|---|
| Reach | distinct artists who recorded their songs | 0.28 | 0.34 |
| Momentum | recordings in the last 2 data years | 0.22 | 0.27 |
| Rooms | share of songs co-written with *published* writers | 0.18 | 0.22 |
| On Spotify | recordings found on Spotify among those looked up | 0.18 | — |
| Growth | (recent 2y + 1) / (prior 2y + 1) | 0.08 | 0.10 |
| Depth | number of works | 0.06 | 0.07 |

Why these:
- **Reach** is the strongest "performance" proxy available: every artist who cuts a writer's song is
  an industry decision in their favor. It also rewards range over one artist's album.
- **Momentum + growth**: publishers sign trajectories, not back catalogs. Growth is smoothed (+1) so
  1→2 recordings doesn't look like 100% growth, and has a lower weight because it's noisy.
- **Validation**: co-writing with signed writers means they're already in professional sessions.
  It's also the closest thing to a "who else rates them" signal in the data.
- **Depth** is a light tiebreaker; volume alone is not quality (that's what the farm filter is for).
- **On Spotify** (if looked up): how many of this writer's shortlisted recordings exist on Spotify.
  Looked-up misses score low (the cut never shipped to the DSP). Writers we didn't look up get a
  neutral 0.5. Genres and listen URLs are shown in the detail panel; they do not enter the score.

Two-stage ranking so we don't call Spotify ~1.6M times: rank everyone on catalog signals, then
`make enrich` looks up only the top-N writers' ISRCs, caches identity/genres/URLs in `spotify_tracks`,
and rescores.

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
- Tests (30) run the real SQL pipeline on a fixture with one fake writer per rule, and check exact
  scores, so a change to weights or filters breaks a test on purpose.

## Hosting
- **Build offline, serve a snapshot.** The full DuckDB is ~400 MB, too big for a serverless function
  and mostly rows the site never shows. `make serving` exports only the ranked writers and their
  songs/recordings to ~5.5 MB of zstd parquet, committed to the repo.
- The hosted API opens an in-memory DuckDB with one view per parquet file and runs the **same SQL
  files** as local. A test exports a snapshot from the fixture and asserts every endpoint returns
  identical JSON from both, so the two can't drift.
- One Vercel project with two **services**: `backend` (FastAPI, public at `/api/*`) and `web`
  (Vite static build, everything else). Each builds independently from its own folder with its own
  dependencies. Vercel passes the original path to the service, so the API is mounted under `/api`
  (`backend/serve.py`), and local dev uses the same layout (Vite proxies `/api`), so the client has one
  relative base URL everywhere.
- No service bindings: the only caller of the API is the browser, through the public route.
  The backend makes no calls to other services.
- Trade-off: data refreshes need a rebuild + redeploy. Fine for a weekly catalog snapshot; see the
  realtime bonus answer for what changes when it isn't.

## Bonus: ranking in real time

**Today** the ranking is a batch job: rebuild everything from parquet (~1 min), export a snapshot,
redeploy. That's the right shape for a catalog snapshot that changes weekly, and it's what the
brief's data supports. If the ranking had to react within seconds to new registrations, releases,
streams or deals, four things change.

1. **Events in, not files.** Ingest changes as a stream: new/changed share registrations (e.g. CWR
   from societies), new ISRCs from distributors/DSP feeds, daily stream counts, deal signings. Each
   event goes on a queue (Kafka, SQS, Vercel Queues) so spikes don't drop data and consumers can replay.

2. **Update features incrementally.** Every feature here is a per-writer aggregate, so an event only
   touches the writers on the affected song:
   - new recording of work W → +1 recording (and maybe +1 distinct artist) for each writer on W.
     Distinct counts need the set of artists per writer (small) or a HyperLogLog sketch at scale.
   - publisher share registered → the writer's `is_published` flips and they leave the pool at once.
   - Hard windows ("2023–2024") don't update cleanly in real time, so replace them with
     **exponential decay**: on each new recording, `momentum = momentum · e^(−λ·Δt) + 1`. O(1) per
     event, no window to slide, and old activity fades smoothly instead of falling off a cliff.

3. **Split scoring from normalization.** Percentile ranks are global: one writer's change nudges
   everyone's percentile, which would mean rescoring 20K writers per event. Instead, keep the
   percentile **breakpoints** (e.g. 1,000 quantiles per factor) in a cached table recomputed every
   few minutes, and score a changed writer against them in O(log n). Rank order is maintained in a
   sorted index (Redis sorted set or a Postgres index on score), so `GET /writers?limit=25` reads
   the top of the index instead of sorting.

4. **Change storage to match.** DuckDB is excellent for the analytical rebuild but is single-writer.
   Real time needs a transactional store for row updates (Postgres) plus the sorted index for
   reads, with DuckDB/parquet kept for the heavy jobs. The API surface stays the same; the web client
   adds polling or server-sent events for live updates.

**Keep a nightly full rebuild** alongside the stream as reconciliation: it corrects drift in the
incremental counts, re-runs entity resolution (merges can change after the fact: a new IPI can
reveal two records are one person), and refreshes the decay and percentile tables. Entity
resolution is the hardest part to do live, so the stream keys on `party_id` and the nightly job
owns the `party_id → writer_id` mapping.

External enrichment (Spotify or similar) stays asynchronous and cached: rate limits make it a
background queue, never part of the request path.

## Bonus: ranking on something other than catalog success

**Collaboration network position:** rank writers by *who they write with*, not by what their
songs have done yet.

Build a graph where writers are nodes and co-writing a song is an edge. Score each writer with a
weighted PageRank-style centrality: an edge is worth more when the collaborator is published,
charting, or themselves highly central. This answers "who is the industry already choosing to work
with?"

Why this one:
- **It's leading, not lagging.** Writers get pulled into sessions with established writers and
  producers before their own hits exist. Catalog success tells you who already won; network
  position tells you who's being let in the room, which is when a signing is cheapest.
- **It's hard to fake.** Content farms and library accounts co-write among themselves in closed
  clusters, so they score low. In this data, 11 of the 14 high-volume farm accounts have never
  written with a published writer.
- **The data supports it.** It's built from the shares table we already have. Our "validation"
  factor (share of songs co-written with published writers) is a first-order version: 9,267 of
  19,786 ranked writers (47%) have at least one published co-writer, and the median ranked writer
  has 6 distinct co-writers, so the graph is dense enough to rank on. The full version is a
  recursive SQL query or a few lines of networkx in the build step.
- **It's actionable for A&R.** The same graph shows *who* connects a writer to the industry, which
  is a warm introduction and a reference check before outreach.

Its blind spots, and what to pair it with:
- It under-ranks self-contained artist-writers who don't co-write. Flag writers who are also the
  recording artist on their own songs and review them separately.
- It's a deal-flow signal, not a commercial one, so use it to find candidates and catalog/streaming
  data to size the offer.

Other metrics we considered:
- **Uncollected publisher share**: the share of a writer's recent recordings with no publisher
  attached. That's revenue nobody is collecting, which values an admin deal on day one.
- **Roster fit**: writers whose collaborators sit outside APG's current roster, to fill gaps
  instead of duplicating strengths.
