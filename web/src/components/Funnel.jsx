import { FILTER_ORDER, STATUS_LABELS, fmt } from "../lib/format.js";

export default function Funnel({ stats, meta, reveal }) {
  const byStatus = Object.fromEntries(stats.map((r) => [r.status, r.writers]));
  const total = stats.reduce((s, r) => s + r.writers, 0);
  let remaining = total;
  const steps = FILTER_ORDER.map((status) => {
    const removed = byStatus[status] ?? 0;
    remaining -= removed;
    return { status, removed, remaining };
  });

  return (
    <div className={`filter-walk${reveal ? " is-on" : ""}`}>
      <ol className="filter-steps">
        {steps.map((s, i) => (
          <li key={s.status} style={{ "--i": i }}>
            <span className="filter-removed num">{fmt(s.removed)} off</span>
            <strong>{STATUS_LABELS[s.status] ?? s.status}</strong>
            <span className="filter-remain num">{fmt(s.remaining)} remain</span>
            <span
              className="filter-taper"
              aria-hidden="true"
              style={{ width: `${Math.max(8, (100 * s.remaining) / total)}%` }}
            />
          </li>
        ))}
      </ol>
      <p className="fine">
        Each writer is counted once, under the first rule they hit.
        Inactive means nothing since {meta.as_of_year - 2}.
      </p>
    </div>
  );
}
