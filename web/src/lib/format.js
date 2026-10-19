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

export const STATUS_LABELS = {
  eligible: "Ranked",
  has_publisher: "Already have a publisher",
  insufficient_data: "Fewer than 3 recordings",
  legacy_catalog: "Career began before 2010",
  inactive: "No recent recordings",
  not_a_person: "Company or placeholder name",
  high_volume_catalog: "Content-farm volume (40+ songs a year)",
};
