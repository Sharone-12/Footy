/**
 * Independent-Poisson scoreline model: given each side's expected goals, the
 * chance of a home win, a draw and an away win. Shared by the match
 * predictions (expected goals from team strength) and the justice table
 * (expected goals from the chances a match actually produced).
 */

function poisson(lambda: number, k: number): number {
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k)
}

function factorial(n: number): number {
  if (n <= 1) return 1
  let r = 1
  for (let i = 2; i <= n; i++) r *= i
  return r
}

/**
 * The joint distribution over exact scorelines treating the two sides as
 * independent: `grid[h][a]` is the chance the match finishes h–a.
 *
 * This is the step `matchProbabilities` has always taken on its way to three
 * buckets, and the base grid `scoreGrid` in `lib/learn.ts` applies its
 * Dixon-Coles correction to. Both read the truncation and the normalisation
 * from here, so the two cannot drift apart on what a cell means.
 *
 * Renormalised, because truncating at `maxGoals` loses the tail. At the
 * default of 7 that tail is worth well under a thousandth for any realistic
 * expected-goals pair, but dividing it out means the grid sums to exactly 1
 * and a caller can read a cell as a probability with no caveat.
 *
 * One `poisson` call per goal count per side rather than one per cell: the
 * cell is a product of two independent marginals, and the fit loop evaluates
 * this thousands of times.
 */
export function scorelineMatrix(
  homeExpected: number,
  awayExpected: number,
  maxGoals = 7,
): number[][] {
  const home = Array.from({ length: maxGoals + 1 }, (_, h) =>
    poisson(homeExpected, h),
  )
  const away = Array.from({ length: maxGoals + 1 }, (_, a) =>
    poisson(awayExpected, a),
  )
  const grid = home.map((ph) => away.map((pa) => ph * pa))
  const total = grid.reduce((s, row) => s + row.reduce((r, p) => r + p, 0), 0)
  return total > 0 ? grid.map((row) => row.map((p) => p / total)) : grid
}

export function matchProbabilities(
  homeExpected: number,
  awayExpected: number,
  maxGoals = 7,
): { homeWin: number; draw: number; awayWin: number } {
  const grid = scorelineMatrix(homeExpected, awayExpected, maxGoals)

  let homeWin = 0
  let draw = 0
  let awayWin = 0

  for (let h = 0; h < grid.length; h++) {
    for (let a = 0; a < grid[h].length; a++) {
      const p = grid[h][a]
      if (h > a) homeWin += p
      else if (h === a) draw += p
      else awayWin += p
    }
  }

  // The grid is normalised, so these three already sum to 1.
  return { homeWin, draw, awayWin }
}
