/**
 * Resolve any CSS colour expression to something WebGL can take.
 *
 * The palette is authored in `oklch()`, which `THREE.Color` cannot parse —
 * it understands hex, `rgb()`, `hsl()` and the named colours, and silently
 * leaves the colour black for anything else. Rather than keep a hand-converted
 * hex copy of every token in the 3D components, where it would drift the first
 * time a token is retuned, hand the expression to the browser and read back
 * what it computes: that is the same value the rest of the page is painted
 * with, including after the theme toggle swaps the variables.
 *
 * `color` on a detached element is enough — computed colour does not need a
 * layout, so nothing is reflowed.
 */
export function cssColor(expr: string, fallback = "#808080"): string {
  if (typeof document === "undefined") return fallback
  const probe = document.createElement("span")
  probe.style.display = "none"
  probe.style.color = expr
  document.body.appendChild(probe)
  const resolved = getComputedStyle(probe).color
  probe.remove()
  // A browser that rejected the expression leaves `color` at its inherited
  // value, which is never the empty string; an unparsed oklch in an old
  // browser lands on the fallback instead of on black.
  return resolved && resolved !== "" ? resolved : fallback
}

/** Resolve a `var(--token)` reference the same way. */
export function cssToken(token: string, fallback?: string): string {
  return cssColor(`var(${token})`, fallback)
}
