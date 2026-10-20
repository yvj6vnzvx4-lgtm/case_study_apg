export const fmt = (n) => (n == null ? "—" : Number(n).toLocaleString("en-US"));

// Names arrive in registry ALL CAPS; show them the way people write them.
export function displayName(raw = "") {
  if (raw !== raw.toUpperCase()) return raw;
  return raw
    .toLowerCase()
    .replace(/(^|[\s\-'’.(])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase())
    .replace(/\bMc(\p{L})/gu, (_, ch) => "Mc" + ch.toUpperCase())
    .replace(/\b(Ii|Iii|Iv|Jr|Sr)\b/g, (m) => (m.length <= 3 && m !== "Jr" && m !== "Sr" ? m.toUpperCase() : m + "."));
}

export const FILTER_ORDER = [
  "has_publisher",
  "chain_ambiguous",
  "not_a_person",
  "insufficient_data",
  "legacy_catalog",
  "inactive",
  "high_volume_catalog",
];

export const STATUS_LABELS = {
  eligible: "Ranked",
  has_publisher: "Already have a publisher",
  chain_ambiguous: "On published songs, pointer never hits them",
  insufficient_data: "Fewer than 3 real cuts (karaoke does not count)",
  legacy_catalog: "Career began before 2010",
  inactive: "No recent recordings",
  not_a_person: "Company or placeholder name",
  high_volume_catalog: "Content-farm volume (40+ songs a year)",
};
