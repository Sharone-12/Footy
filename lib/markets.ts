/**
 * Match markets read off the scoreline grid.
 *
 * Every selection here is a predicate over scorelines, so its probability is
 * the sum of the grid cells where it holds. That matters for the double: two
 * selections from the same match are NOT independent — "over 2.5" and "both
 * teams score" lean the same way, and multiplying them would overstate the
 * pair badly. Summing the cells where both hold gives the exact joint
 * probability with the correlation already in it.
 *
 * No @/ imports: `node lib/markets.test.ts` runs this bare.
 */

export type MarketGroup = "result" | "double-chance" | "totals" | "btts" | "scorer"

export type Leg = {
  key: string
  group: MarketGroup
  label: string
  /** Holds for this scoreline? Absent on a scorer leg, which is not one. */
  test?: (home: number, away: number) => boolean
  prob: number
}

/** Sum the cells where a selection holds. */
export function probOf(grid: number[][], test: (h: number, a: number) => boolean): number {
  let p = 0
  for (let h = 0; h < grid.length; h++) {
    for (let a = 0; a < grid[h].length; a++) if (test(h, a)) p += grid[h][a]
  }
  return p
}

/**
 * The markets shown under a fixture.
 *
 * Deliberately leaves out the near-certainties — over 0.5 goals, under 5.5 —
 * which hold about 95% of the time and tell a reader nothing. Result legs are
 * named by club so a card reads "Barcelona win" rather than "1".
 */
export function marketsFor(grid: number[][], home: string, away: string): Leg[] {
  const defs: Omit<Leg, "prob">[] = [
    { key: "home", group: "result", label: `${home} win`, test: (h, a) => h > a },
    { key: "draw", group: "result", label: "Draw", test: (h, a) => h === a },
    { key: "away", group: "result", label: `${away} win`, test: (h, a) => h < a },
    { key: "1X", group: "double-chance", label: `${home} or draw`, test: (h, a) => h >= a },
    { key: "X2", group: "double-chance", label: `${away} or draw`, test: (h, a) => h <= a },
    { key: "12", group: "double-chance", label: "Either team wins", test: (h, a) => h !== a },
    { key: "o1.5", group: "totals", label: "Over 1.5 goals", test: (h, a) => h + a > 1.5 },
    { key: "u1.5", group: "totals", label: "Under 1.5 goals", test: (h, a) => h + a < 1.5 },
    { key: "o2.5", group: "totals", label: "Over 2.5 goals", test: (h, a) => h + a > 2.5 },
    { key: "u2.5", group: "totals", label: "Under 2.5 goals", test: (h, a) => h + a < 2.5 },
    { key: "o3.5", group: "totals", label: "Over 3.5 goals", test: (h, a) => h + a > 3.5 },
    { key: "u3.5", group: "totals", label: "Under 3.5 goals", test: (h, a) => h + a < 3.5 },
    { key: "btts", group: "btts", label: "Both teams score", test: (h, a) => h > 0 && a > 0 },
    {
      key: "btts-no",
      group: "btts",
      label: "A clean sheet either way",
      test: (h, a) => h === 0 || a === 0,
    },
  ]
  return defs.map((d) => ({ ...d, prob: probOf(grid, d.test!) }))
}

/** The most likely exact scoreline, and how likely it is. */
export function likeliestScore(grid: number[][]): { home: number; away: number; prob: number } {
  let best = { home: 0, away: 0, prob: -1 }
  for (let h = 0; h < grid.length; h++) {
    for (let a = 0; a < grid[h].length; a++) {
      if (grid[h][a] > best.prob) best = { home: h, away: a, prob: grid[h][a] }
    }
  }
  return best
}

/**
 * Chance a player scores at least once.
 *
 * Their share of the club's goals this season, applied to the goals the model
 * expects the club to score here, through a Poisson. It knows nothing about
 * whether they start — the site holds no team news — so it reads as an average
 * night rather than a claim about this one.
 */
export function scorerChance(
  playerGoals: number,
  teamSeasonGoals: number,
  teamExpectedGoals: number,
): number {
  if (playerGoals <= 0 || teamSeasonGoals <= 0) return 0
  const share = Math.min(1, playerGoals / teamSeasonGoals)
  return 1 - Math.exp(-teamExpectedGoals * share)
}

/** At or above this a selection is true nearly always, and says nothing. */
const CEILING = 0.9
/** Below this it is not a "safe" pick worth leading with. */
const FLOOR = 0.5

/**
 * The single safest selection worth showing.
 *
 * Capped on purpose: "either team wins" at 93% is not a pick, it is a
 * description of football. Among what is left, the most likely one wins.
 */
export function safestLeg(legs: Leg[]): Leg | null {
  const worth = legs.filter((l) => l.prob < CEILING && l.prob >= FLOOR)
  if (worth.length === 0) return null
  return worth.reduce((best, l) => (l.prob > best.prob ? l : best))
}

export type Double = { legs: [Leg, Leg]; prob: number }

/**
 * The safest pair of selections, by exact joint probability.
 *
 * Pairs come from different market groups, and a pair where one leg implies
 * the other is dropped: "Barcelona win" with "Barcelona or draw" is not a
 * double, it is the narrower leg wearing a second name, and its joint
 * probability is just the narrower one's.
 */
export function safestDouble(grid: number[][], legs: Leg[]): Double | null {
  const pool = legs.filter((l) => l.test && l.prob < CEILING && l.prob > 0.15)
  let best: Double | null = null

  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const a = pool[i]
      const b = pool[j]
      if (a.group === b.group) continue
      const joint = probOf(grid, (h, x) => a.test!(h, x) && b.test!(h, x))
      // One implies the other, so the pair adds nothing over the narrower leg.
      if (joint >= Math.min(a.prob, b.prob) - 1e-9) continue
      if (!best || joint > best.prob) best = { legs: [a, b], prob: joint }
    }
  }
  return best
}
