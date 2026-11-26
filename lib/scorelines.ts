/**
 * Reading a scoreline grid.
 *
 * `scoreGrid` in `lib/learn.ts` returns `grid[h][a]`, the chance the match
 * finishes h–a, over 0..maxGoals in each direction and normalised to 1. That
 * is the shape the model works in. It is not the shape a reader works in: at
 * the default maxGoals of 7 it is 64 cells, and the outer two ranks are worth
 * a few hundredths of a percent each — real probability, but spread so thin
 * that showing it costs two columns of width and buys nothing.
 *
 * So fold the tail in rather than truncate it. Everything from `cap + 1` up
 * collapses into one trailing rank, and because it is a sum and not a cut the
 * folded grid still totals 1 and every band still adds up to the headline
 * percentage already on the page.
 */

/** Which outcome a cell belongs to, from the home side's point of view. */
export type Band = "home" | "draw" | "away" | "mixed"

export type FoldedGrid = {
  /** `cells[h][a]`, over the folded ranks. */
  cells: number[][]
  /** Axis labels, parallel to the indices: "0".."cap", then "cap+1 and up". */
  labels: string[]
  bandOf: (h: number, a: number) => Band
}

/**
 * Collapse the sparse tail of a scoreline grid into a single trailing rank.
 *
 * A folded cell covers several scorelines, so it no longer always sits in one
 * outcome. Where only one axis is folded the comparison still holds whatever
 * the real score was — 6-or-more home against 3 away is a home win at 6, at 7
 * and at any score above — and only the corner, where both sides are folded,
 * mixes wins with draws. That one cell is worth a few ten-thousandths, and
 * `bandOf` reports it as `mixed` rather than quietly filing it under one
 * outcome.
 */
export function foldScorelines(grid: number[][], cap = 5): FoldedGrid {
  const n = cap + 2 // 0..cap, plus the folded rank
  const last = n - 1
  const cells = Array.from({ length: n }, () => Array(n).fill(0) as number[])

  for (let h = 0; h < grid.length; h++) {
    for (let a = 0; a < grid[h].length; a++) {
      cells[Math.min(h, last)][Math.min(a, last)] += grid[h][a]
    }
  }

  const labels = [
    ...Array.from({ length: cap + 1 }, (_, i) => String(i)),
    `${cap + 1}+`,
  ]

  return { cells, labels, bandOf: (h, a) => bandFor(h, a, last) }
}

/**
 * The band a folded cell sits in, given the index of the folded rank.
 *
 * Split out from `foldScorelines` because a closure cannot cross the server
 * boundary into a client component, and the 3D view needs the same rule as the
 * table. Pass `last` as the index of the trailing rank; pass `Infinity` for an
 * unfolded grid, where every cell is a single scoreline.
 */
export function bandFor(h: number, a: number, last: number): Band {
  if (h === last && a === last) return "mixed"
  if (h > a) return "home"
  if (h < a) return "away"
  return "draw"
}

export type TopScoreline = { home: number; away: number; prob: number }

/**
 * The single most likely exact scoreline.
 *
 * Read off the unfolded grid, so it names a real scoreline rather than a rank:
 * folding first could return a home score of "6+", which is not a result
 * anyone can put on a scoreboard.
 */
export function topScoreline(grid: number[][]): TopScoreline {
  let best: TopScoreline = { home: 0, away: 0, prob: -1 }
  for (let h = 0; h < grid.length; h++) {
    for (let a = 0; a < grid[h].length; a++) {
      if (grid[h][a] > best.prob) best = { home: h, away: a, prob: grid[h][a] }
    }
  }
  return best
}

/**
 * The n most likely exact scorelines, most likely first.
 *
 * How concentrated these are is the thing the three headline percentages
 * cannot say: a 41% home win built from one likely 1–0 and a 41% home win
 * smeared across six scorelines are not the same forecast.
 */
export function likeliestScorelines(grid: number[][], n = 3): TopScoreline[] {
  const all: TopScoreline[] = []
  for (let h = 0; h < grid.length; h++) {
    for (let a = 0; a < grid[h].length; a++) {
      all.push({ home: h, away: a, prob: grid[h][a] })
    }
  }
  return all.sort((x, y) => y.prob - x.prob).slice(0, n)
}

/**
 * Sum a grid into the three outcomes.
 *
 * Give it the unfolded grid. It reads a cell by comparing its two indices,
 * which is exact for every cell of a real grid but not for the folded corner,
 * where `6+ – 6+` covers 7–6 and 6–7 as well as the draws: those land in the
 * draw total. The mistake is worth a couple of millionths, so it would not
 * show on screen, but there is no reason to display a figure that is wrong on
 * purpose when the exact one is one argument away.
 */
export function bandTotals(grid: number[][]): {
  homeWin: number
  draw: number
  awayWin: number
} {
  let homeWin = 0
  let draw = 0
  let awayWin = 0
  for (let h = 0; h < grid.length; h++) {
    for (let a = 0; a < grid[h].length; a++) {
      if (h > a) homeWin += grid[h][a]
      else if (h === a) draw += grid[h][a]
      else awayWin += grid[h][a]
    }
  }
  return { homeWin, draw, awayWin }
}
