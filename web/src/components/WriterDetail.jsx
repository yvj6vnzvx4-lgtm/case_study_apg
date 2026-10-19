import { useEffect, useMemo, useState } from "react";
import { fetchWriter } from "../api.js";
import { displayName, fmt } from "../lib/format.js";

const WORKS_PREVIEW = 12;

// Collapse multiple recordings by the same artist (explicit/clean, remasters) into one line.
function byArtist(recs) {
  const m = new Map();
  for (const r of recs) {
    const k = (r.artist_name ?? "").toUpperCase();
    const e = m.get(k) ?? { artist_name: r.artist_name, recording_year: r.recording_year, count: 0, isrc: r.isrc };
    e.count += 1;
    e.recording_year = Math.max(e.recording_year ?? 0, r.recording_year ?? 0) || null;
    m.set(k, e);
  }
  return [...m.values()].sort((a, b) => (b.recording_year ?? 0) - (a.recording_year ?? 0));
}

function groupWorks(rows) {
  const byWork = new Map();
  for (const r of rows) {
    if (!byWork.has(r.work_id)) byWork.set(r.work_id, { ...r, roles: new Set(), recordings: new Map() });
    const w = byWork.get(r.work_id);
    w.roles.add(r.party_role);
    if (r.isrc) w.recordings.set(r.isrc, r);
  }
  return [...byWork.values()]
    .map((w) => ({ ...w, recordings: byArtist([...w.recordings.values()]) }))
    .sort((a, b) => (b.recordings[0]?.recording_year ?? 0) - (a.recordings[0]?.recording_year ?? 0));
}

// pct is a percentile rank (0-1) within the ranked pool
const standing = (pct) =>
  pct >= 0.5
    ? `Top ${Math.max(1, Math.round((1 - pct) * 100))}% of ranked writers.`
    : `Ranks above ${Math.round(pct * 100)}% of ranked writers.`;

const roleLabel = (r) => r.replace(/([a-z])([A-Z])/g, "$1 / $2");

export default function WriterDetail({ writerId, factors, meta, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    fetchWriter(writerId).then(setData).catch((e) => setError(e.message));
  }, [writerId]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const works = useMemo(() => (data ? groupWorks(data.works) : []), [data]);
  const y = meta?.as_of_year;

  return (
    <aside className="detail" aria-label="Writer details">
      <div className="detail-inner">
        <button type="button" className="detail-close btn" onClick={onClose}>Close</button>
        {error && <p className="notice notice-error">{error}</p>}
        {!data && !error && <p className="muted">Loading writer…</p>}
        {data && (() => {
          const w = data.writer;
          return (
            <>
              <header className="detail-head">
                <h2>{displayName(w.display_name)}</h2>
                <p className="muted">
                  Ranked {w.rank} of {fmt(meta?.eligible_writers)}
                  {w.ipi_name_number && <>, IPI {w.ipi_name_number}</>}
                </p>
                <p className="detail-score">
                  <span className="num">{w.score.toFixed(1)}</span>
                  <span className="muted">out of 100</span>
                </p>
              </header>

              <section className="detail-section">
                <h3>Why they rank here</h3>
                <ul className="factors">
                  {factors.map((f) => {
                    const c = w[`c_${f.key}`] ?? 0;
                    const max = f.weight * 100;
                    const pct = max ? c / max : 0;
                    return (
                      <li key={f.key}>
                        <div className="factor-top">
                          <span className="factor-name">
                            <span className="swatch" style={{ background: f.color }} />
                            {f.label}
                          </span>
                          <span className="num">
                            {c.toFixed(1)} <span className="muted">of {max.toFixed(0)}</span>
                          </span>
                        </div>
                        <span className="meter" aria-hidden="true">
                          <span style={{ width: `${pct * 100}%`, background: f.color }} />
                        </span>
                        <p className="factor-explain">
                          {f.explain(w, y)}.{" "}
                          <span className="muted">
                            {standing(pct)}
                          </span>
                        </p>
                      </li>
                    );
                  })}
                </ul>
              </section>

              <p className="notice">
                "Unpublished" means no publisher is attached to their US streaming shares in this data.
                Confirm their deal status before reaching out.
              </p>

              <section className="detail-section">
                <h3>Songs <span className="muted">{fmt(works.length)}</span></h3>
                <ul className="works">
                  {(showAll ? works : works.slice(0, WORKS_PREVIEW)).map((wk) => (
                    <li key={wk.work_id}>
                      <div className="work-title">
                        <span>{displayName(wk.title)}</span>
                        <span className="muted">{[...wk.roles].map(roleLabel).join(", ")}</span>
                      </div>
                      {wk.recordings.length > 0 ? (
                        <ul className="recordings">
                          {wk.recordings.map((r) => (
                            <li key={r.isrc}>
                              <span>
                                {displayName(r.artist_name ?? "Unknown artist")}
                                {r.count > 1 && <span className="muted"> ({r.count} versions)</span>}
                              </span>
                              <span className="num muted">{r.recording_year ?? "—"}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="muted">No recordings listed</p>
                      )}
                    </li>
                  ))}
                </ul>
                {works.length > WORKS_PREVIEW && (
                  <button type="button" className="btn btn-quiet" onClick={() => setShowAll((s) => !s)}>
                    {showAll ? "Show fewer songs" : `Show all ${works.length} songs`}
                  </button>
                )}
              </section>

              {w.party_ids?.length > 1 && (
                <p className="fine">
                  Combined from {w.party_ids.length} registry entries with the same name: {w.party_ids.join(", ")}.
                </p>
              )}
            </>
          );
        })()}
      </div>
    </aside>
  );
}
