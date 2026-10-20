import { useEffect, useMemo, useRef, useState } from "react";
import { fetchMeta, fetchStats, fetchTopWriters } from "./api.js";
import { activeFactors } from "./lib/factors.js";
import { fmt } from "./lib/format.js";
import { MethodScroll, useActiveSection } from "./lib/useScrollStory.js";
import CatalogFunnel from "./components/CatalogFunnel.jsx";
import EligibilityStory from "./components/EligibilityStory.jsx";
import ScoreStory from "./components/ScoreStory.jsx";
import MessStory from "./components/MessStory.jsx";
import Controls from "./components/Controls.jsx";
import WriterList from "./components/WriterList.jsx";
import WriterDetail from "./components/WriterDetail.jsx";

const isWide = () => window.matchMedia("(min-width: 960px)").matches;

const METHOD = [
  { id: "totals", label: "The catalog" },
  { id: "filter", label: "Eligibility" },
  { id: "score", label: "The cut score" },
  { id: "mess", label: "The metadata" },
];

const METHOD_IDS = METHOD.map((c) => c.id);
const MAIN_IDS = ["top", "roster"];

function methodHash() {
  const id = window.location.hash.replace(/^#/, "");
  return METHOD_IDS.includes(id) ? id : null;
}

export default function App() {
  const [meta, setMeta] = useState(null);
  const [stats, setStats] = useState([]);
  const [writers, setWriters] = useState([]);
  const [filters, setFilters] = useState({ limit: 25, minWorks: 1, q: "" });
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [methodOpen, setMethodOpen] = useState(() => Boolean(methodHash()));
  const [methodHint, setMethodHint] = useState(false);
  const methodRoot = useRef(null);

  const mainActive = useActiveSection(MAIN_IDS, undefined, !methodOpen);
  const methodActive = useActiveSection(METHOD_IDS, methodRoot, methodOpen);
  const active = methodOpen ? methodActive : mainActive;

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

  useEffect(() => {
    document.body.classList.toggle("method-open", methodOpen);
    return () => document.body.classList.remove("method-open");
  }, [methodOpen]);

  useEffect(() => {
    if (!methodOpen || !methodRoot.current) return;
    const id = methodHash() || "totals";
    const node = methodRoot.current.querySelector(`#${id}`);
    methodRoot.current.scrollTop = node ? node.offsetTop : 0;
  }, [methodOpen]);

  useEffect(() => {
    if (!methodOpen) {
      setMethodHint(false);
      return undefined;
    }
    let armed = false;
    const hide = () => {
      if (armed) setMethodHint(false);
    };
    const el = methodRoot.current;
    const show = window.setTimeout(() => {
      setMethodHint(true);
      armed = true;
    }, 380);
    const timer = window.setTimeout(() => setMethodHint(false), 5200);
    el?.addEventListener("scroll", hide, { passive: true });
    return () => {
      window.clearTimeout(show);
      window.clearTimeout(timer);
      el?.removeEventListener("scroll", hide);
    };
  }, [methodOpen]);

  useEffect(() => {
    const sync = () => setMethodOpen(Boolean(methodHash()));
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
    };
  }, []);

  useEffect(() => {
    if (!methodOpen) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") closeMethod();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [methodOpen]);

  const openMethod = (e) => {
    e?.preventDefault();
    setMethodOpen(true);
    if (!methodHash()) window.history.pushState(null, "", "#totals");
  };

  const closeMethod = (e) => {
    e?.preventDefault();
    setMethodOpen(false);
    if (methodHash()) window.history.pushState(null, "", "#roster");
  };

  const factors = useMemo(() => activeFactors(meta?.weights), [meta]);

  return (
    <div className={`story${methodOpen ? " is-method-open" : ""}`}>
      <nav
        className={`story-nav${methodOpen ? " is-open" : ""}`}
        aria-label="Methodology"
        aria-hidden={!methodOpen}
        {...(!methodOpen ? { inert: "" } : {})}
      >
          {METHOD.map((c) => (
            <a
              key={c.id}
              href={`#${c.id}`}
              title={c.label}
              className={active === c.id ? "is-active" : undefined}
              onClick={(e) => {
                e.preventDefault();
                window.history.replaceState(null, "", `#${c.id}`);
                const layer = methodRoot.current;
                const node = layer?.querySelector(`#${c.id}`);
                if (layer && node) layer.scrollTo({ top: node.offsetTop, behavior: "smooth" });
              }}
            >
              <span className="sr-only">{c.label}</span>
            </a>
          ))}
        </nav>

      <div className="main-flow" {...(methodOpen ? { inert: "" } : {})}>
      <div className="hero-pin" id="top">
        <header className="chapter-hero">
          <h1>Writer Scout</h1>
          <p className="lede">
            Spot unpublished writers and hear the work.
          </p>
          <a className="scroll-cue" href="#roster" aria-label="Go to the writer list">
            The list
            <span className="scroll-cue-stem" aria-hidden="true" />
            <span className="scroll-cue-arrow" aria-hidden="true" />
          </a>
        </header>
      </div>

      <section className="roster" id="roster">
        <header className="roster-intro">
          <h2>Writers to look at.</h2>
          <p className="chapter-lede">
            {meta
              ? `${fmt(meta.eligible_writers)} unpublished writers, ranked on reach, recent cuts, rooms, and DSP presence. Open anyone to hear the work.`
              : "Unpublished writers ranked on reach, recent cuts, rooms, and DSP presence. Open anyone to hear the work."}
          </p>
          <a
            className="method-open-btn"
            href="#totals"
            onClick={openMethod}
            aria-expanded={methodOpen}
          >
            How we ranked
            <span className="method-open-arrow" aria-hidden="true" />
          </a>
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

      <div
        className={`method-layer${methodOpen ? " is-open" : ""}`}
        ref={methodRoot}
        aria-hidden={!methodOpen}
        {...(!methodOpen ? { inert: "" } : {})}
      >
        <MethodScroll.Provider value={{ rootRef: methodRoot, active: methodOpen }}>
          <CatalogFunnel meta={meta} hint={methodHint} />
          <EligibilityStory stats={stats} meta={meta} />
          <ScoreStory factors={factors} />
          <MessStory onBack={closeMethod} />
        </MethodScroll.Provider>
      </div>
    </div>
  );
}
