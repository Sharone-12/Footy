/**
 * Is the prediction model honest about its own confidence?
 *
 * Hit rate alone can't say: a model that calls every favourite at 90% and one
 * that calls them at 55% score the same when the favourite wins. Calibration
 * groups predictions by how sure the model said it was and checks how often
 * it was right; the Brier score folds that into one number.
 */

type Outcome = "home" | "draw" | "away"

export type Settled = {
  homeWin: number
  draw: number
  awayWin: number
  predicted: Outcome
  actual: Outcome | null
}

export type CalibrationBucket = {
  label: string
  count: number
  /** Mean confidence the model stated, 0-100. */
  said: number
  /** How often the pick came in, 0-100. */
  hit: number
}

export type Calibration = {
  count: number
  buckets: CalibrationBucket[]
  /** Mean squared error across the three outcomes: 0 is perfect. */
  brier: number
  /** What always saying a third each would score. Beating this is the bar. */
  coinFlip: number
  /** 0-100: how much of the gap from coin flip to perfect the model closes. */
  skill: number
}

const EDGES: [number, number, string][] = [
  [0, 0.45, "under 45%"],
  [0.45, 0.55, "45–55%"],
  [0.55, 0.65, "55–65%"],
  [0.65, 1.01, "65%+"],
]

const COIN_FLIP = 2 / 3

export function calibration(predictions: Settled[]): Calibration {
  const settled = predictions.filter((p) => p.actual !== null)
  const buckets = EDGES.map(([, , label]) => ({ label, count: 0, said: 0, hit: 0 }))
  let brier = 0

  for (const p of settled) {
    // Predictions are stored as rounded percentages; dividing by their sum
    // makes them probabilities whatever the scale or rounding drift.
    const total = p.homeWin + p.draw + p.awayWin || 1
    const probs: Record<Outcome, number> = {
      home: p.homeWin / total,
      draw: p.draw / total,
      away: p.awayWin / total,
    }
    for (const o of ["home", "draw", "away"] as const) {
      brier += (probs[o] - (p.actual === o ? 1 : 0)) ** 2
    }
    const sure = probs[p.predicted]
    const b = buckets[EDGES.findIndex(([lo, hi]) => sure >= lo && sure < hi)]
    if (!b) continue
    b.count++
    b.said += sure
    b.hit += p.predicted === p.actual ? 1 : 0
  }

  const n = settled.length
  const score = n ? brier / n : COIN_FLIP
  return {
    count: n,
    buckets: buckets.map((b) => ({
      ...b,
      said: b.count ? Math.round((b.said / b.count) * 100) : 0,
      hit: b.count ? Math.round((b.hit / b.count) * 100) : 0,
    })),
    brier: Math.round(score * 1000) / 1000,
    coinFlip: Math.round(COIN_FLIP * 1000) / 1000,
    // "+ 0" turns the -0 a hair-below-baseline score rounds to into 0.
    skill: Math.round((1 - score / COIN_FLIP) * 100) + 0,
  }
}
