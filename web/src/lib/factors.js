// Display metadata for each score component. Weights come from the API (/meta).
export const FACTORS = [
  {
    key: "reach",
    label: "Reach",
    color: "var(--f-reach)",
    explain: (w) => `${w.distinct_artists} different artists have recorded their songs`,
  },
  {
    key: "momentum",
    label: "Momentum",
    color: "var(--f-momentum)",
    explain: (w, y) => `${w.recent_recordings} recordings in ${y - 1}–${y}`,
  },
  {
    key: "validation",
    label: "Validation",
    color: "var(--f-validation)",
    explain: (w) =>
      `${w.works_with_published_cowriter} of ${w.works} songs co-written with published writers`,
  },
  {
    key: "growth",
    label: "Growth",
    color: "var(--f-growth)",
    explain: (w, y) =>
      `${w.recent_recordings} recordings in ${y - 1}–${y}, up from ${w.prior_recordings} in ${y - 3}–${y - 2}`,
  },
  {
    key: "depth",
    label: "Depth",
    color: "var(--f-depth)",
    explain: (w) => `${w.works} songs in their catalog`,
  },
  {
    key: "popularity",
    label: "Spotify popularity",
    color: "var(--f-popularity)",
    explain: (w) =>
      w.top3_popularity == null
        ? "Not matched on Spotify, so scored as average"
        : `Top tracks average ${Math.round(w.top3_popularity)} popularity on Spotify`,
  },
];

export const activeFactors = (weights = []) => {
  const byKey = Object.fromEntries(weights.map((w) => [w.component, w.weight]));
  return FACTORS.filter((f) => byKey[f.key] > 0).map((f) => ({ ...f, weight: byKey[f.key] }));
};
