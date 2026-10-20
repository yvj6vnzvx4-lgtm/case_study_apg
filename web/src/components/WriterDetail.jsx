import { useEffect, useMemo, useState } from "react";
import { fetchWriter } from "../api.js";
import { displayName, fmt } from "../lib/format.js";
import SplitBar from "./SplitBar.jsx";

const WORKS_PREVIEW = 8;

function byArtist(recs) {
  const m = new Map();
  for (const r of recs) {
    const k = (r.artist_name ?? "").toUpperCase();
    const e = m.get(k) ?? {
      artist_name: r.artist_name,
      recording_year: r.recording_year,
      count: 0,
      isrc: r.isrc,
      spotify_id: r.spotify_id,
      spotify_url: r.spotify_url,
    };
    e.count += 1;
    e.recording_year = Math.max(e.recording_year ?? 0, r.recording_year ?? 0) || null;
    if (!e.spotify_id && r.spotify_id) e.spotify_id = r.spotify_id;
    if (!e.spotify_url && r.spotify_url) e.spotify_url = r.spotify_url;
    m.set(k, e);
  }
  return [...m.values()].sort((a, b) => (b.recording_year ?? 0) - (a.recording_year ?? 0));
}

function groupWorks(rows) {
  const byWork = new Map();
  for (const r of rows) {
    if (!byWork.has(r.work_id)) byWork.set(r.work_id, { ...r, recordings: new Map() });
    const w = byWork.get(r.work_id);
    if (r.isrc) w.recordings.set(r.isrc, r);
  }
  return [...byWork.values()]
    .map((w) => ({ ...w, recordings: byArtist([...w.recordings.values()]) }))
    .sort((a, b) => (b.recordings[0]?.recording_year ?? 0) - (a.recordings[0]?.recording_year ?? 0));
}

export default function WriterDetail({ writerId, factors, meta, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    setData(null);
    setShowAll(false);
    fetchWriter(writerId).then(setData).catch((e) => setError(e.message));
  }, [writerId]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const works = useMemo(() => (data ? groupWorks(data.works) : []), [data]);
  const play = useMemo(
    () => works.flatMap((wk) => wk.recordings).find((r) => r.spotify_id),
    [works],
  );
  const y = meta?.as_of_year;
  const shown = showAll ? works : works.slice(0, WORKS_PREVIEW);

  return (
    <aside className="detail" aria-label="Writer details">
      <div className="detail-inner">
        <button type="button" className="detail-close btn-text" onClick={onClose}>Close</button>
        {error && <p className="notice notice-error">{error}</p>}
        {!data && !error && <p className="muted">Loading writer…</p>}
        {data && (() => {
          const w = data.writer;
          return (
            <>
              <header className="detail-head">
                <p className="chapter-kicker">Rank {w.rank}</p>
                <h2>{displayName(w.display_name)}</h2>
                <p className="detail-score">
                  <span className="num">{w.score.toFixed(1)}</span>
                </p>
                <SplitBar writer={w} factors={factors} />
                {play?.spotify_id && (
                  <iframe
                    className="spotify-embed"
                    title={`Play ${displayName(w.display_name)} on Spotify`}
                    src={`https://open.spotify.com/embed/track/${play.spotify_id}?theme=0`}
                    height="80"
                    allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                    loading="lazy"
                  />
                )}
              </header>

              <ul className="why">
                {factors.map((f) => (
                  <li key={f.key}>
                    <span className="swatch" style={{ background: f.color }} />
                    <span>{f.explain(w, y)}.</span>
                  </li>
                ))}
              </ul>

              <section className="detail-section">
                <h3>Cuts</h3>
                {shown.length === 0 ? (
                  <p className="muted">No songs listed.</p>
                ) : (
                  <ul className="works">
                    {shown.map((wk) => {
                      const listen = wk.recordings.find((r) => r.spotify_url);
                      const artists = wk.recordings
                        .map((r) => displayName(r.artist_name ?? "Unknown artist"))
                        .filter(Boolean);
                      const year = wk.recordings[0]?.recording_year;
                      const cut = artists.length === 0
                        ? "No recordings listed"
                        : artists.length === 1
                          ? artists[0]
                          : `${artists[0]} + ${artists.length - 1} more`;
                      return (
                        <li key={wk.work_id}>
                          <p className="work-title">
                            {displayName(wk.title)}
                            {wk.in_dispute ? <span className="work-flag">Disputed</span> : null}
                          </p>
                          <p className="work-cuts">
                            <span>
                              {cut}
                              {year ? ` · ${year}` : ""}
                            </span>
                            {listen?.spotify_url && (
                              <a className="listen" href={listen.spotify_url} target="_blank" rel="noreferrer">
                                Listen
                              </a>
                            )}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {works.length > WORKS_PREVIEW && (
                  <button type="button" className="btn-text" onClick={() => setShowAll((s) => !s)}>
                    {showAll ? "Show fewer" : `All ${fmt(works.length)} songs`}
                  </button>
                )}
              </section>

              <p className="fine detail-caveat">
                No publisher on US streaming shares in this snapshot — confirm deal status before an offer.
                {w.ipi_name_number ? ` IPI ${w.ipi_name_number}.` : ""}
                {w.party_ids?.length > 1
                  ? ` Combined from ${w.party_ids.length} registry entries.`
                  : ""}
              </p>
            </>
          );
        })()}
      </div>
    </aside>
  );
}
