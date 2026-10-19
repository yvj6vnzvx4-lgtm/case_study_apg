import { useEffect, useMemo, useState } from "react";
import { fetchMeta, fetchStats, fetchTopWriters } from "./api.js";
import { activeFactors } from "./lib/factors.js";
import Funnel from "./components/Funnel.jsx";
import Controls from "./components/Controls.jsx";
import WriterList from "./components/WriterList.jsx";
import WriterDetail from "./components/WriterDetail.jsx";

const isWide = () => window.matchMedia("(min-width: 960px)").matches;

export default function App() {
  const [meta, setMeta] = useState(null);
  const [stats, setStats] = useState([]);
  const [writers, setWriters] = useState([]);
  const [filters, setFilters] = useState({ limit: 25, minWorks: 1, q: "" });
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([fetchMeta(), fetchStats()])
      .then(([m, s]) => { setMeta(m); setStats(s); })
      .catch((e) => setError(e.message));
  }, []);

  // debounce the name search so we don't query on every keystroke
  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => ({ ...f, q: query })), 250);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    setLoading(true);
    fetchTopWriters(filters)
      .then((rows) => {
        setWriters(rows);
        setError(null);
        setSelectedId((id) => (rows.some((r) => r.writer_id === id) ? id : isWide() ? rows[0]?.writer_id ?? null : null));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [filters]);

  const factors = useMemo(() => activeFactors(meta?.weights), [meta]);

  return (
    <div className="app">
      <header className="masthead">
        <div>
          <h1>Writer Scout</h1>
          <p className="lede">
            Unpublished songwriters ranked by who is recording their songs, how recently, and who they write with.
          </p>
        </div>
        {meta && (
          <p className="snapshot">
            Catalog data through {new Date(meta.as_of + "T00:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            <br />US streaming shares
            {!meta.has_spotify && <><br />Spotify popularity not included</>}
          </p>
        )}
      </header>

      {meta && stats.length > 0 && <Funnel stats={stats} meta={meta} />}

      <Controls
        filters={filters}
        query={query}
        onQuery={setQuery}
        onChange={(patch) => setFilters((f) => ({ ...f, ...patch }))}
        writers={writers}
        factors={factors}
      />

      {error && <p className="notice notice-error" role="alert">{error}</p>}

      <div className="workspace">
        <WriterList
          writers={writers}
          factors={factors}
          loading={loading}
          selectedId={selectedId}
          onSelect={setSelectedId}
          query={filters.q}
        />
        {selectedId && (
          <WriterDetail
            key={selectedId}
            writerId={selectedId}
            factors={factors}
            meta={meta}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>
    </div>
  );
}
