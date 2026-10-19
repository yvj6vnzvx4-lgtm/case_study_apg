// Stacked bar: each factor's contribution to the 0–100 score, like shares on a split sheet.
export default function SplitBar({ writer, factors, scale = true }) {
  const total = factors.reduce((s, f) => s + (writer[`c_${f.key}`] ?? 0), 0);
  const label = factors
    .map((f) => `${f.label} ${(writer[`c_${f.key}`] ?? 0).toFixed(1)}`)
    .join(", ");
  return (
    <span className="split" role="img" aria-label={`Score breakdown: ${label}`}>
      <span className="split-fill" style={{ width: scale ? `${total}%` : "100%" }}>
        {factors.map((f) => {
          const c = writer[`c_${f.key}`] ?? 0;
          return c > 0 ? (
            <span key={f.key} className="split-seg" style={{ flexGrow: c, background: f.color }} />
          ) : null;
        })}
      </span>
    </span>
  );
}
