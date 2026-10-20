import { FILTER_ORDER, STATUS_LABELS, fmt } from "../lib/format.js";
import { useScrollSteps } from "../lib/useScrollStory.js";

export default function EligibilityStory({ stats, meta }) {
  const byStatus = Object.fromEntries((stats ?? []).map((r) => [r.status, r.writers]));
  const total = (stats ?? []).reduce((s, r) => s + r.writers, 0);
  let remaining = total;
  const steps = FILTER_ORDER.map((status) => {
    const removed = byStatus[status] ?? 0;
    remaining -= removed;
    return {
      status,
      removed,
      remaining,
      label: STATUS_LABELS[status] ?? status,
    };
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
        <p className="chapter-kicker">Eligibility</p>
        <h2>Most of the list is not a signing conversation.</h2>
        <p className="chapter-lede pin-lede">
          Linked deals come off first, then writers who only appear on songs that already have a publisher sitting on them — the file never points at their share. Then companies, thin evidence, legacy names, quiet years, and content farms.
        </p>
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
