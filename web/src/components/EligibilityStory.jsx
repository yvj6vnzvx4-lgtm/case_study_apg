import { FILTER_ORDER, STATUS_LABELS, fmt } from "../lib/format.js";
import { useScrollSteps } from "../lib/useScrollStory.js";

export default function EligibilityStory({ stats, meta }) {
  const byStatus = Object.fromEntries((stats ?? []).map((r) => [r.status, r.writers]));
  const total = (stats ?? []).reduce((s, r) => s + r.writers, 0);
  let remaining = total;
  const steps = FILTER_ORDER.flatMap((status) => {
    const removed = byStatus[status] ?? 0;
    remaining -= removed;
    if (status === "high_volume_catalog" && removed === 0) return [];
    return [{
      status,
      removed,
      remaining,
      label: STATUS_LABELS[status] ?? status,
    }];
  });
  const [track, shown] = useScrollSteps(steps.length || 1);
  const last = shown > 0 ? steps[shown - 1] : null;

  return (
    <section
      className="pin-track"
      id="filter"
      ref={track}
      style={{ "--beats": Math.max(steps.length, 3) }}
    >
      <div className="pin-sticky">
        <h2>Eligibility</h2>
        {steps.length > 0 ? (
          <>
            <div className="story-stack" aria-live="polite">
              {steps.map((s, i) => (
                <div
                  key={s.status}
                  className={`story-step story-step-rule${shown > i ? " is-in" : ""}${shown === i + 1 ? " is-now" : ""}`}
                >
                  <p className="cascade-n num">{fmt(s.removed)}</p>
                  <p>
                    {s.label}
                    {shown === i + 1 ? ` · ${fmt(s.remaining)} remain` : ""}
                  </p>
                </div>
              ))}
            </div>
            <p className={`chapter-note funnel-note${shown >= steps.length ? " is-in" : ""}`}>
              {last
                ? `${fmt(last.remaining)} remain. Each writer is counted once, under the first rule they hit.`
                : null}
            </p>
          </>
        ) : (
          <p className="muted">Loading filters…</p>
        )}
      </div>
    </section>
  );
}
