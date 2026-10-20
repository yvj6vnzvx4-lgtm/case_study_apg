import SplitBar from "./SplitBar.jsx";
import { displayName, fmt } from "../lib/format.js";
import { genreList } from "../lib/factors.js";

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
      <ol>
        {writers.map((w) => {
          const genres = genreList(w.spotify_genres).slice(0, 2);
          return (
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
                    {fmt(w.distinct_artists)} artists cutting · {fmt(w.works)} songs
                    {w.matched_tracks > 0 && (
                      <span className="dsp-mark"> · {fmt(w.matched_tracks)} on Spotify</span>
                    )}
                    {genres.length > 0 && (
                      <span className="genre-inline"> · {genres.join(", ")}</span>
                    )}
                  </span>
                </span>
                <SplitBar writer={w} factors={factors} />
                <span className="score num">{w.score.toFixed(1)}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
