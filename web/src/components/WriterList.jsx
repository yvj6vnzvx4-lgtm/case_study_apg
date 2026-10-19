import SplitBar from "./SplitBar.jsx";
import { displayName, fmt } from "../lib/format.js";

export default function WriterList({ writers, factors, loading, selectedId, onSelect, query }) {
  if (!loading && writers.length === 0) {
    return (
      <div className="ranking ranking-empty">
        {query ? (
          <p>
            No ranked writer matches "{query}". They may have been filtered out by one of the rules above,
            or try fewer letters.
          </p>
        ) : (
          <p>No writers meet these filters. Lower the minimum number of songs.</p>
        )}
      </div>
    );
  }

  return (
    <section className={`ranking ${loading ? "is-loading" : ""}`} aria-label="Ranked writers" aria-busy={loading}>
      <div className="ranking-head" aria-hidden="true">
        <span>Rank</span><span>Writer</span><span>Score breakdown</span><span className="num">Score</span>
      </div>
      <ol>
        {writers.map((w) => (
          <li key={w.writer_id}>
            <button
              type="button"
              className={`row ${w.writer_id === selectedId ? "is-selected" : ""}`}
              aria-pressed={w.writer_id === selectedId}
              onClick={() => onSelect(w.writer_id)}
            >
              <span className="rank num">{w.rank}</span>
              <span className="who">
                <span className="name">{displayName(w.display_name)}</span>
                <span className="sub">
                  {fmt(w.distinct_artists)} artists, {fmt(w.works)} songs, active since {w.career_start_year}
                </span>
              </span>
              <SplitBar writer={w} factors={factors} />
              <span className="score num">{w.score.toFixed(1)}</span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
