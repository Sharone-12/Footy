/** Self-check for match markets: `node lib/markets.test.ts` */
import assert from "node:assert/strict"
import { scoreGrid, outcomeProbs } from "./learn.ts"
import {
  marketsFor, probOf, likeliestScore, scorerChance, safestLeg, safestDouble,
} from "./markets.ts"

const grid = scoreGrid(1.7, 1.1, -0.17)
const legs = marketsFor(grid, "Home FC", "Away FC")
const by = (k: string) => legs.find((l) => l.key === k)!
const close = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps

// The grid is a probability distribution.
assert.ok(close(probOf(grid, () => true), 1))

// Markets agree with the win/draw/loss the rest of the site shows: one grid.
const p = outcomeProbs(1.7, 1.1, -0.17)
assert.ok(close(by("home").prob, p.homeWin))
assert.ok(close(by("draw").prob, p.draw))
assert.ok(close(by("away").prob, p.awayWin))

// Complements and double chances add up exactly.
for (const [a, b] of [["o1.5", "u1.5"], ["o2.5", "u2.5"], ["o3.5", "u3.5"], ["btts", "btts-no"]]) {
  assert.ok(close(by(a).prob + by(b).prob, 1), `${a}+${b}`)
}
assert.ok(close(by("1X").prob, p.homeWin + p.draw))
assert.ok(close(by("X2").prob, p.awayWin + p.draw))
assert.ok(close(by("12").prob, p.homeWin + p.awayWin))

// Ordering that must hold for any scoreline distribution.
assert.ok(by("o1.5").prob > by("o2.5").prob && by("o2.5").prob > by("o3.5").prob)
// Labels say what they mean. Result legs carry the club name rather than "1"
// and "2", and the two inverses are spelled out: "either team wins" and "a
// clean sheet either way" both read as riddles.
assert.equal(by("home").label, "Home FC win")
assert.equal(by("away").label, "Away FC win")
assert.equal(by("1X").label, "Home FC or draw")
assert.equal(by("12").label, "No draw")
assert.equal(by("btts-no").label, "At least one clean sheet")
for (const l of legs) assert.ok(!/either/i.test(l.label), `vague label: ${l.label}`)

// The likeliest scoreline is a real cell, and no cell beats it.
const best = likeliestScore(grid)
assert.ok(close(best.prob, grid[best.home][best.away]))
for (const row of grid) for (const cell of row) assert.ok(cell <= best.prob + 1e-12)

// ── The double is a joint probability, not a product ──

const dbl = safestDouble(grid, legs)!
const [l1, l2] = dbl.legs
assert.ok(l1.group !== l2.group, "legs must come from different markets")
// A real joint probability never exceeds either leg.
assert.ok(dbl.prob <= l1.prob + 1e-12 && dbl.prob <= l2.prob + 1e-12)
assert.ok(close(dbl.prob, probOf(grid, (h, a) => l1.test!(h, a) && l2.test!(h, a))))
// And it is not the product: same-match legs are correlated, which is the
// entire reason this is computed on the grid.
assert.notEqual(Math.round(dbl.prob * 1e6), Math.round(l1.prob * l2.prob * 1e6))

// Nothing redundant: a pair where one leg implies the other is rejected.
assert.equal(safestDouble(grid, [by("home"), by("1X")]), null, "home within 1X is not a double")
// Contradictory legs are impossible, so they can never be the safest pair.
assert.ok(close(probOf(grid, (h, a) => by("o3.5").test!(h, a) && by("u1.5").test!(h, a)), 0))

// ── The single pick is capped so it stays meaningful ──

const pick = safestLeg(legs)!
assert.ok(pick.prob < 0.9 && pick.prob >= 0.5, `${pick.key} at ${pick.prob}`)
assert.equal(safestLeg(legs.map((l) => ({ ...l, prob: 0.99 }))), null)
assert.equal(safestLeg([]), null)

// ── Scorer ──

// A player with a third of his club's goals, in a match worth 1.8 to them.
const s = scorerChance(12, 36, 1.8)
assert.ok(close(s, 1 - Math.exp(-1.8 / 3)))
assert.ok(s > 0.4 && s < 0.5, `${s}`)
// More goals, or a better matchup, can only raise it.
assert.ok(scorerChance(18, 36, 1.8) > s)
assert.ok(scorerChance(12, 36, 2.6) > s)
// Degenerate inputs stay at zero rather than NaN.
assert.equal(scorerChance(0, 36, 1.8), 0)
assert.equal(scorerChance(5, 0, 1.8), 0)
// A player credited with every goal still cannot reach certainty.
assert.ok(scorerChance(40, 36, 3) < 1)

// A one-sided fixture still produces a sane pick and pair.
const lop = scoreGrid(2.9, 0.4, -0.17)
const lopLegs = marketsFor(lop, "Strong", "Weak")
assert.ok(lopLegs.find((l) => l.key === "home")!.prob > 0.8)
assert.ok(safestDouble(lop, lopLegs) !== null)

console.log(
  `markets ok · safest ${pick.key} ${(pick.prob * 100).toFixed(0)}% · ` +
    `double ${l1.key}+${l2.key} ${(dbl.prob * 100).toFixed(0)}% ` +
    `(multiplying would claim ${(l1.prob * l2.prob * 100).toFixed(0)}%)`,
)
