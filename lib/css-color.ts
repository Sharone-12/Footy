/**
 * Resolve any CSS colour expression to sRGB hex, which is what WebGL takes.
 *
 * Two conversions, and the second one is the one that bites. The palette is
 * authored in `oklch()`, so the first step hands the expression to the browser
 * and reads back the computed value — that resolves `var()` tokens and gives
 * the same value the rest of the page is painted with, including after the
 * theme toggle swaps the variables.
 *
 * But Chrome returns a colour authored in `oklch()` as `oklch()`: CSS Color 4
 * keeps the colour function in the computed value rather than downgrading it
 * to `rgb()`. `THREE.Color` parses only `rgb()`, `hsl()`, hex and the named
 * colours — everything else logs "Unknown color model" and leaves the material
 * at its default white. Handing it a computed `oklch()` string therefore turns
 * the whole scene flat white, which is a hard failure that looks like a
 * styling choice.
 *
 * So convert properly: paint the colour onto a 1x1 canvas and read the pixel.
 * The browser does the oklch-to-sRGB conversion and the out-of-gamut clamping,
 * and `getImageData` hands back plain 8-bit sRGB. That is correct for every
 * colour syntax the browser can paint, including ones not invented yet, which
 * a hand-written parser would not be.
 */

/** The 1x1 scratch canvas, made once. `null` once known unavailable. */
let probeCtx: CanvasRenderingContext2D | null | undefined

/** A colour no palette uses, to detect a `fillStyle` the canvas refused. */
const SENTINEL = "#ff00ff"

function context(): CanvasRenderingContext2D | null {
  if (probeCtx === undefined) {
    probeCtx =
      document.createElement("canvas").getContext("2d", {
        willReadFrequently: true,
      }) ?? null
  }
  return probeCtx
}

const hex2 = (n: number) => n.toString(16).padStart(2, "0")

/**
 * A browser-computed colour string as `#rrggbb`, or null if it would not paint.
 *
 * Assigning an unparseable value to `fillStyle` is a silent no-op that leaves
 * the previous value in place, so a sentinel goes in first: if the assignment
 * did not take, `fillStyle` still reads as the sentinel and the colour is
 * refused rather than quietly painted magenta.
 */
function srgbHex(value: string): string | null {
  const ctx = context()
  if (!ctx || !value) return null

  ctx.fillStyle = SENTINEL
  const refused = ctx.fillStyle
  ctx.fillStyle = value
  if (ctx.fillStyle === refused && value.trim().toLowerCase() !== SENTINEL) {
    return null
  }

  ctx.clearRect(0, 0, 1, 1)
  ctx.fillRect(0, 0, 1, 1)
  try {
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
    // Nothing painted: a fully transparent colour has no hue to give back.
    if (a === 0) return null
    return `#${hex2(r)}${hex2(g)}${hex2(b)}`
  } catch {
    // A tainted canvas cannot be read. Nothing here draws an image onto it, so
    // this should not happen, but a wrong colour beats a thrown page.
    return null
  }
}

export function cssColor(expr: string, fallback = "#808080"): string {
  if (typeof document === "undefined") return fallback

  // `color` on a detached element is enough — computed colour does not need a
  // layout, so nothing is reflowed.
  const probe = document.createElement("span")
  probe.style.display = "none"
  probe.style.color = expr
  document.body.appendChild(probe)
  const computed = getComputedStyle(probe).color
  probe.remove()

  // The raw expression is the second chance: a browser that refused to compute
  // it may still paint it, and vice versa.
  return srgbHex(computed) ?? srgbHex(expr) ?? fallback
}

/** Resolve a `var(--token)` reference the same way. */
export function cssToken(token: string, fallback?: string): string {
  return cssColor(`var(${token})`, fallback)
}
