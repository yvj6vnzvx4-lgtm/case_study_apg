import { displayName } from "../lib/format.js";

function downloadCsv(writers) {
  const cols = [
    ["rank", "Rank"], ["display_name", "Writer"], ["score", "Score"], ["works", "Songs"],
    ["recordings", "Recordings"], ["distinct_artists", "Artists"], ["recent_recordings", "Recent recordings"],
    ["prior_recordings", "Prior recordings"], ["works_with_published_cowriter", "Songs with published co-writers"],
    ["career_start_year", "Active since"], ["last_year", "Last year"], ["ipi_name_number", "IPI"],
  ];
  const esc = (v) => (v == null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v);
  const rows = writers.map((w) =>
    cols.map(([k]) => esc(k === "display_name" ? displayName(w[k]) : w[k])).join(",")
  );
  const blob = new Blob([[cols.map(([, h]) => h).join(","), ...rows].join("\n")], { type: "text/csv" });
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(blob),
    download: `writer-scout-top-${writers.length}.csv`,
  });
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function Controls({ filters, query, onQuery, onChange, writers, factors }) {
  return (
    <section className="controls" aria-label="Filters">
      <div className="control-row">
        <label className="field field-search">
          <span>Find a writer</span>
          <input
            type="search"
            value={query}
            placeholder="Name"
            onChange={(e) => onQuery(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Show top</span>
          <select value={filters.limit} onChange={(e) => onChange({ limit: Number(e.target.value) })}>
            {[10, 25, 50, 100, 250].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label className="field">
          <span>At least</span>
          <select value={filters.minWorks} onChange={(e) => onChange({ minWorks: Number(e.target.value) })}>
            {[1, 3, 5, 10].map((n) => <option key={n} value={n}>{n} {n === 1 ? "song" : "songs"}</option>)}
          </select>
        </label>
        <button type="button" className="btn" onClick={() => downloadCsv(writers)} disabled={!writers.length}>
          Download CSV
        </button>
      </div>
      <ul className="legend" aria-label="Score components">
        {factors.map((f) => (
          <li key={f.key}>
            <span className="swatch" style={{ background: f.color }} />
            {f.label} <span className="muted">{Math.round(f.weight * 100)}%</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
