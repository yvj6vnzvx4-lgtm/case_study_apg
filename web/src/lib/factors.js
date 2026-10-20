// Display metadata for each score component. Weights come from the API (/meta).
export const FACTORS = [
  {
    key: "reach",
    label: "Reach",
    color: "var(--f-reach)",
    explain: (w) => `${w.distinct_artists} different artists have cut their songs`,
    story: "Artists who cut the original — not karaoke, Kidz Bop, or piano channels.",
  },
  {
    key: "momentum",
    label: "Momentum",
    color: "var(--f-momentum)",
    explain: (w, y) => `${w.recent_recordings} recordings in ${y - 1}–${y}`,
    story: "Recordings in the last two years of the catalog — are they working now?",
  },
  {
    key: "validation",
    label: "Rooms",
    color: "var(--f-validation)",
    explain: (w) =>
      `${w.works_with_published_cowriter} of ${w.works} songs co-written with published writers`,
    story: "Share of songs co-written with a published writer — already in professional rooms.",
  },
  {
    key: "dsp",
    label: "On Spotify",
    color: "var(--f-dsp)",
    explain: (w) => {
      if (!w.looked_up_tracks) return "Not looked up yet, so scored as average";
      const n = w.matched_tracks ?? 0;
      return n
        ? `${n} of ${w.looked_up_tracks} looked-up recordings are on Spotify`
        : "Looked up, but none of these recordings are on Spotify";
    },
    story: "Looked-up recordings that exist on Spotify. Not stream counts — the API does not provide them.",
  },
  {
    key: "growth",
    label: "Growth",
    color: "var(--f-growth)",
    explain: (w, y) =>
      `${w.recent_recordings} recordings in ${y - 1}–${y}, up from ${w.prior_recordings} in ${y - 3}–${y - 2}`,
    story: "Recent activity versus the two years before, smoothed so 1→2 does not look like a breakout.",
  },
  {
    key: "depth",
    label: "Depth",
    color: "var(--f-depth)",
    explain: (w) => `${w.works} songs in their catalog`,
    story: "Number of works. A light tiebreaker — volume is not quality.",
  },
];

export const activeFactors = (weights = []) => {
  const byKey = Object.fromEntries(weights.map((w) => [w.component, w.weight]));
  return FACTORS.filter((f) => byKey[f.key] > 0).map((f) => ({ ...f, weight: byKey[f.key] }));
};

export function genreList(raw) {
  if (!raw) return [];
  return String(raw)
    .split(",")
    .map((g) => g.trim())
    .filter(Boolean);
}
