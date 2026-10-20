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
    note: "Warner, Universal, Sony sit on the work with a blank preceding_id. A leftover percentage on a multi-writer hit is a deal, not an unsigned catalog.",
  },
  {
    n: "0",
    line: "Karaoke is not a cut.",
    note: "Party Tyme, Kidz Bop, and five spellings of the same ISRC are credit noise. They do not earn reach.",
  },
];

export default function MessStory() {
  const [track, shown] = useScrollSteps(BEATS.length);

  return (
    <section
      className="pin-track"
      id="mess"
      ref={track}
      style={{ "--beats": BEATS.length }}
    >
      <div className="pin-sticky">
        <p className="chapter-kicker">The metadata</p>
        <h2>Music credits are a mess. That is the test.</h2>
        <p className="chapter-lede pin-lede">
          A signing list that trusts every string in the file will put signed writers in the room.
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
        <p className={`chapter-note funnel-note${shown >= BEATS.length ? " is-in" : ""}`}>
          We repair the share chain first. Names are not the filter. Disputed works stay
          on the writer and drop out of the score.
        </p>
      </div>
    </section>
  );
}
