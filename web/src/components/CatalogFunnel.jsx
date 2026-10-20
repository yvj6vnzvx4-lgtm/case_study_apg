import { fmt } from "../lib/format.js";
import { useScrollSteps } from "../lib/useScrollStory.js";

function asOf(meta) {
  return new Date(`${meta.as_of}T00:00:00`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

export default function CatalogFunnel({ meta, hint }) {
  const steps = meta
    ? [
        { n: fmt(meta.total_writers), label: "writers in the data" },
        {
          n: fmt(meta.eligible_writers),
          label: `ranked to review · ${((100 * meta.eligible_writers) / meta.total_writers).toFixed(1)}% of the catalog`,
        },
        {
          n: meta.has_spotify ? fmt(meta.spotify_matches) : "—",
          label: meta.has_spotify
            ? "looked-up recordings found on Spotify"
            : "Spotify not linked",
        },
      ]
    : [];
  const [track, shown] = useScrollSteps(steps.length || 1);

  return (
    <section
      className="pin-track"
      id="totals"
      ref={track}
      style={{ "--beats": steps.length || 3 }}
    >
      <div className="pin-sticky">
        <div className="catalog-heading">
          <p className={`method-scroll-hint${hint ? " is-on" : ""}`} role="status">
            Scroll to walk through how we ranked
            <span className="method-scroll-cue" aria-hidden="true" />
          </p>
          <h2>Catalog</h2>
        </div>
        {meta ? (
          <>
            <div className="story-stack" aria-live="polite">
              {steps.map((s, i) => (
                <div
                  key={s.label}
                  className={`story-step${shown > i ? " is-in" : ""}`}
                  data-stage={i}
                >
                  <p className="cascade-n num">{s.n}</p>
                  <p>{s.label}</p>
                </div>
              ))}
            </div>
            <p className={`chapter-note funnel-note${shown >= steps.length ? " is-in" : ""}`}>
              US streaming shares through {asOf(meta)}.
            </p>
          </>
        ) : (
          <p className="muted">Loading catalog…</p>
        )}
      </div>
    </section>
  );
}
