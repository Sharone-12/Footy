/**
 * Scoreboard digits: each digit flips over when it changes.
 *
 * No state and no effect. A digit is keyed by its place and its value, so a
 * changed digit is a new element and the CSS flip plays on it alone; digits
 * that did not change stay still. Places count from the right, so "9" turning
 * into "10" flips the tens in rather than re-keying every digit.
 */
export function Flip({ value }: { value: string | number }) {
  const text = String(value)
  const chars = [...text]
  return (
    <span className="inline-flex" aria-label={text}>
      {chars.map((c, i) => {
        const place = chars.length - i
        return /\d/.test(c) ? (
          <span key={`${place}-${c}`} aria-hidden className="flip-digit">
            {c}
          </span>
        ) : (
          <span key={`${place}-sep`} aria-hidden>
            {c === " " ? " " : c}
          </span>
        )
      })}
    </span>
  )
}
