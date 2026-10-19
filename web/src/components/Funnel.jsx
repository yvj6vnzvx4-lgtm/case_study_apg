import { STATUS_LABELS, fmt } from "../lib/format.js";

// The eligibility funnel: how the full writer universe narrows to the ranked pool.
export default function Funnel({ stats, meta }) {
  const total = stats.reduce((s, r) => s + r.writers, 0);
  const ordered = [
    ...stats.filter((r) => r.status === "eligible"),
    ...stats.filter((r) => r.status !== "eligible"),
  ];

  return (
    <details className="funnel">
      <summary>
        <span className="funnel-headline">
          <strong>{fmt(meta.eligible_writers)}</strong> of {fmt(total)} writers qualify for ranking
        </span>
        <span className="funnel-toggle">How writers are filtered</span>
        <span className="funnel-bar" aria-hidden="true">
          {ordered.map((r, i) => (
            <span
              key={r.status}
              className={`funnel-seg ${r.status === "eligible" ? "is-eligible" : ""}`}
              style={{ flexGrow: r.writers, "--shade": i }}
              title={`${STATUS_LABELS[r.status] ?? r.status}: ${fmt(r.writers)}`}
            />
          ))}
        </span>
      </summary>
      <ul className="funnel-legend">
        {ordered.map((r, i) => (
          <li key={r.status}>
            <span className={`swatch ${r.status === "eligible" ? "is-eligible" : ""}`} style={{ "--shade": i }} />
            <span className="funnel-label">{STATUS_LABELS[r.status] ?? r.status}</span>
            <span className="num">{fmt(r.writers)}</span>
            <span className="num muted">{((100 * r.writers) / total).toFixed(1)}%</span>
          </li>
        ))}
      </ul>
      <p className="fine">
        Rules apply in this order, and each writer is counted once under the first rule they hit.
        "No recent recordings" means nothing since {meta.as_of_year - 2}.
      </p>
    </details>
  );
}
