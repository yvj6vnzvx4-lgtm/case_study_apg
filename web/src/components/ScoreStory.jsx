import { useScrollSteps } from "../lib/useScrollStory.js";

const R = 46;
const C = 2 * Math.PI * R;
const GAP = 2.2;

export default function ScoreStory({ factors }) {
  const total = factors.reduce((s, f) => s + f.weight, 0) || 1;
  const [track, shown] = useScrollSteps(factors.length || 1);
  const current = shown > 0 ? factors[shown - 1] : null;
  const pct = current ? Math.round((current.weight / total) * 100) : 0;
  const complete = shown >= factors.length && factors.length > 0;

  let offset = 0;
  const slices = factors.map((f) => {
    const share = f.weight / total;
    const start = offset;
    offset += share;
    return { ...f, share, start };
  });

  return (
    <section
      className="pin-track"
      id="score"
      ref={track}
      style={{ "--beats": Math.max(factors.length, 3) }}
    >
      <div className="pin-sticky pin-donut">
        <p className="chapter-kicker">The cut score</p>
        <h2>Ranked on recording activity, rooms, and DSP presence.</h2>
        {factors.length > 0 ? (
          <>
            <div className="donut" aria-live="polite">
              <svg viewBox="0 0 120 120" role="img" aria-label="Cut score weights">
                <circle
                  className="donut-track"
                  cx="60"
                  cy="60"
                  r={R}
                  fill="none"
                  strokeWidth="9"
                />
                <g transform="rotate(-90 60 60)">
                  {slices.map((s, i) => {
                    const lit = shown > i;
                    const arc = Math.max(0, s.share * C - GAP);
                    return (
                      <circle
                        key={s.key}
                        className={`donut-slice${lit ? " is-in" : ""}`}
                        cx="60"
                        cy="60"
                        r={R}
                        fill="none"
                        stroke={s.color}
                        strokeWidth="9"
                        strokeLinecap="butt"
                        strokeDasharray={lit ? `${arc} ${C}` : `0 ${C}`}
                        strokeDashoffset={-s.start * C}
                      />
                    );
                  })}
                </g>
              </svg>
              {current && (
                <div className="donut-core" key={current.key}>
                  <p className="cascade-n num" style={{ color: current.color }}>{pct}%</p>
                  <p className="donut-label">{current.label}</p>
                  <p className="donut-story">{current.story}</p>
                </div>
              )}
            </div>
            <p className={`chapter-note funnel-note${complete ? " is-in" : ""}`}>
              Each factor is a percentile inside the scouting tool, then weighted. Stream counts are not included in the Spotify API.
            </p>
          </>
        ) : (
          <p className="muted">Loading weights…</p>
        )}
      </div>
    </section>
  );
}
