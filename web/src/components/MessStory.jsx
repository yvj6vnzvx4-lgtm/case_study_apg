import { useScrollSteps } from "../lib/useScrollStory.js";

const BEATS = [
  {
    n: "233k",
    line: "Publisher links jammed two IDs in one field.",
    note: "preceding_id is supposed to point at one writer share. A quarter-million rows use id|id. Equality joins miss the deal.",
  },
  {
    n: "633k",
    line: "Publisher shares that point at nobody.",
    note: "Warner, Universal, Sony sit on the work with a blank preceding_id. Writer splits are never in the file, so leftover % is not a closed deal. We still will not pitch that hit as an unsigned catalog.",
  },
  {
    n: "0",
    line: "Karaoke is not a cut.",
    note: "Party Tyme, Kidz Bop, and five spellings of the same ISRC are credit noise. They do not earn reach.",
  },
];

export default function MessStory({ onBack }) {
  const steps = BEATS.length + 1;
  const [track, shown] = useScrollSteps(steps);
  const atCta = shown >= steps;

  return (
    <section
      className="pin-track"
      id="mess"
      ref={track}
      style={{ "--beats": steps }}
    >
      <div className="pin-sticky">
        <h2>Metadata</h2>
        <p className="chapter-lede pin-lede">
          Music metadata is messy. The list can surface a legal name and miss the stage name sitting on another record. Publisher pointers often never hit the writer row, and writer splits are blank in this file.
        </p>
        <div className="story-stack" aria-live="polite">
          {BEATS.map((b, i) => (
            <div
              key={b.line}
              className={`story-step story-step-rule${shown > i ? " is-in" : ""}${shown === i + 1 ? " is-now" : ""}`}
              data-stage={i}
            >
              <p className="cascade-n num">{b.n}</p>
              <p>{b.line}</p>
              {shown === i + 1 ? <p>{b.note}</p> : null}
            </div>
          ))}
        </div>
        <p className={`chapter-note funnel-note${shown === BEATS.length ? " is-in" : ""}`}>
          We repair the share chain first. Names are not the filter. Disputed works stay
          on the writer and drop out of the score.
        </p>
        <a
          href="#roster"
          className={`method-end-cta${atCta ? " is-in" : ""}`}
          onClick={onBack}
        >
          <span className="method-end-arrow" aria-hidden="true">‹</span>
          Back to Writer Scout
        </a>
      </div>
    </section>
  );
}
