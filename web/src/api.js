// Same-origin by default: on Vercel /api/* routes to the backend service, and in local
// dev Vite proxies /api to `make api` (see vite.config.js). VITE_API_URL overrides it.
const BASE = (import.meta.env.VITE_API_URL ?? "/api").replace(/\/$/, "");

async function get(path) {
  let r;
  try {
    r = await fetch(`${BASE}${path}`);
  } catch {
    throw new Error(`Can't reach the API at ${BASE}. If you're running locally, start it with "make api".`);
  }
  if (!r.ok) throw new Error(`The API returned ${r.status} for ${path}.`);
  return r.json();
}

export function fetchTopWriters({ limit = 25, minWorks = 1, q = "" } = {}) {
  const params = new URLSearchParams({ limit, min_works: minWorks });
  if (q.trim()) params.set("q", q.trim());
  return get(`/writers?${params}`);
}

export const fetchWriter = (writerId) => get(`/writers/${writerId}`);
export const fetchStats = () => get("/stats");
export const fetchMeta = () => get("/meta");
