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
- **Funnel** makes the filtering visible: 646,889 writers → 486 ranked (publishers, missing pointers, companies, thin catalogs, legacy, inactive).
- **Detail panel** translates each percentile into plain language ("22 different artists have recorded
  their songs. Top 1% of ranked writers."), lists songs and the artists who cut them, and reminds the
  scout to confirm deal status before reaching out.
- **Search keeps the global rank** (computed in SQL), so searching a name tells you where they stand overall.
- CSV export for taking a shortlist into a meeting; responsive layout with a bottom sheet on phones.
- Tests (36) run the real SQL pipeline on a fixture with one fake writer per rule, and check exact
  scores, so a change to weights or filters breaks a test on purpose.

## Hosting
- **Build offline, serve a snapshot.** The full DuckDB is ~400 MB, too big for a serverless function
  and mostly rows the site never shows. `make serving` exports only the ranked writers and their
  songs/recordings to ~0.2 MB of parquet, committed to the repo.
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

**Today** the ranking is a batch job: parquet → DuckDB (~1 min) → compact serving snapshot
(~0.2 MB) → Vercel (FastAPI + Vite). That matches a CISAC-style dump that moves weekly, and it is
what this brief's files support. If the ranking had to move within seconds of a new registration,
ISRC, or deal, four things change.

1. **Events in, not files.** Ingest CWR/share updates, new ISRCs, DSP matches, and deal flags as a
   stream onto a queue (Kafka, SQS, or Vercel Queues) so spikes replay instead of dropping.

2. **Update features incrementally.** Every score input here is a per-writer aggregate, so an event
   only touches the writers on that song:
   - new recording of work W → +1 recording (and maybe +1 artist) for each writer on W
   - publisher share that links, or an unallocated publisher percentage on a multi-writer work →
     `is_published` flips and they leave the pool immediately (the same graph repairs, as events)
   - calendar windows ("2023–2024") do not slide cleanly, so replace them with **exponential decay**:
     `momentum = momentum · e^(−λ·Δt) + 1`. O(1) per event; old activity fades instead of falling
     off a cliff.

3. **Split scoring from normalization.** Percentile ranks are global: one writer's change would
   rescore the whole pool. Keep quantile **breakpoints** (recomputed every few minutes) and score a
   changed writer against them in O(log n). Serve `GET /writers?limit=25` from a sorted index
   (Redis sorted set or Postgres on `score`), not a full `ORDER BY`.

4. **Storage that can take row writes.** DuckDB is the right engine for the analytical rebuild and
   a poor live primary: one writer at a time. Put live rows in Postgres, the leaderboard in the
   sorted index, and keep DuckDB/parquet for heavy jobs. The HTTP API stays the same; the web client
   polls or uses server-sent events.

**Keep a nightly full rebuild** as reconciliation. It corrects incremental drift, re-runs entity
resolution (a new IPI can merge two `party_id`s), re-applies pipe-split / residual-publisher
repairs, and refreshes decay and quantiles. Entity resolution is the part that should not be live:
the stream keys on `party_id`; the nightly job owns `party_id → writer_id`.

Spotify (or any DSP) stays a **background queue, never the request path**. Client-credentials
Development Mode returned `QUOTA_EXCEEDED` with multi-hour `Retry-After` after a few hundred ISRC
lookups. Presence belongs in `spotify_tracks`, refreshed asynchronously, exactly as `make enrich`
does now.

## Bonus: ranking on something other than catalog success

**Collaboration network position:** rank writers by *who they write with*, not by what their
songs have already done.

Writers are nodes; a co-write is an edge. Score with a weighted PageRank: an edge is worth more
when the collaborator is published, or is themselves central. That answers "who is the industry
already choosing to sit with?"

Why this one:
- **It's leading, not lagging.** People get pulled into sessions with established writers before
  they have a catalog anyone can score. Catalog success is who already won; network position is
  who is being let in the room, which is when a signing is cheapest.
- **It's hard to fake.** Content farms co-write in closed clusters and stay peripheral. After the
  unpublished definition was tightened (linked deals, blank pointers, leftover publisher %), the
  farm filter currently removes **zero** people from this pool — the graph repairs already took
  the closed catalogs out.
- **The data already supports a first-order version.** "Rooms" (share of songs co-written with a
  *published* writer) is 18% of the live score. Of the **486** ranked writers, **91 (19%)** have at
  least one such cowrite. The remaining pool is sparser than an earlier, looser shortlist because
  we no longer treat "on a published song, pointer never hits them" as unsigned. The full
  centrality score is a recursive SQL query or a short NetworkX pass in the build step.
- **It's actionable for A&R.** The same graph names *who* connects a writer to the industry — a
  warm introduction and a reference check.

Blind spots, and what to pair it with:
- It under-ranks self-contained artist-writers who rarely co-write. Flag people who are also the
  recording artist on their own ISRCs and review them separately.
- It is a deal-flow signal, not a commercial one. Use it to find candidates; use cuts / DSP
  presence to size the offer.

Other metrics we considered:
- **Uncollected publisher share** on *truly bare* recent works (no OriginalPublisher on the song
  at all). We already treat an unallocated publisher *percentage* as a deal, not as unsigned
  inventory. What remains bare is closer to "revenue nobody is collecting," which values an admin
  deal on day one.
- **Roster fit:** collaborators who sit outside APG's current roster, to fill gaps instead of
  duplicating strengths.
