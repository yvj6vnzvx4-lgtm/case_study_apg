import { useEffect, useMemo, useState } from "react";
import { fetchMeta, fetchStats, fetchTopWriters } from "./api.js";
import { activeFactors } from "./lib/factors.js";
import { fmt } from "./lib/format.js";
import { useActiveSection } from "./lib/useScrollStory.js";
import CatalogFunnel from "./components/CatalogFunnel.jsx";
import EligibilityStory from "./components/EligibilityStory.jsx";
import ScoreStory from "./components/ScoreStory.jsx";
import MessStory from "./components/MessStory.jsx";
import Controls from "./components/Controls.jsx";
import WriterList from "./components/WriterList.jsx";
import WriterDetail from "./components/WriterDetail.jsx";

const isWide = () => window.matchMedia("(min-width: 960px)").matches;

const CHAPTERS = [
  { id: "top", label: "Title" },
  { id: "totals", label: "Totals" },
  { id: "filter", label: "Filter" },
  { id: "score", label: "Score" },
  { id: "mess", label: "Metadata" },
  { id: "roster", label: "Writers" },
];

const CHAPTER_IDS = CHAPTERS.map((c) => c.id);

export default function App() {
  const [meta, setMeta] = useState(null);
  const [stats, setStats] = useState([]);
  const [writers, setWriters] = useState([]);
  const [filters, setFilters] = useState({ limit: 25, minWorks: 1, q: "" });
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const active = useActiveSection(CHAPTER_IDS);

  useEffect(() => {
    Promise.all([fetchMeta(), fetchStats()])
      .then(([m, s]) => { setMeta(m); setStats(s); })
      .catch((e) => setError(e.message));
  }, []);

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
    <div className="story">
      <nav className="story-nav" aria-label="Sections">
        {CHAPTERS.map((c) => (
          <a
            key={c.id}
            href={`#${c.id}`}
            title={c.label}
            className={active === c.id ? "is-active" : undefined}
          >
            <span className="sr-only">{c.label}</span>
          </a>
        ))}
      </nav>

      <div className="hero-pin" id="top">
        <header className="chapter-hero">
          <p className="eyebrow">A signing meeting · US streaming shares</p>
          <h1>Writer Scout</h1>
          <p className="lede">
            From a messy catalog, the unpublished writers whose songs real artists
            are cutting now — the next few years, not a cleaned-up back catalog.
          </p>
          <a className="scroll-cue" href="#totals">Scroll to explore</a>
        </header>
      </div>

      <CatalogFunnel meta={meta} />
      <EligibilityStory stats={stats} meta={meta} />
      <ScoreStory factors={factors} />
      <MessStory />

      <section className="roster" id="roster">
        <header className="roster-intro">
          <p className="chapter-kicker">Who to sign</p>
          <h2>Writers to take into the room.</h2>
          <p className="chapter-lede">
            {meta
              ? `${fmt(meta.eligible_writers)} people whose unpublished songs are being cut by real artists. Ranked for the next few years of activity — open anyone for the rooms and the cuts.`
              : "Ranked for the next few years of activity."}
          </p>
        </header>
        <Controls
          filters={filters}
          query={query}
          onQuery={setQuery}
          onChange={(patch) => setFilters((f) => ({ ...f, ...patch }))}
          writers={writers}
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
      </section>
    </div>
  );
}
