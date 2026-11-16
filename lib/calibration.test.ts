/** Self-check for prediction calibration: `node lib/calibration.test.ts` */
import assert from "node:assert/strict"
import { calibration, type Settled } from "./calibration.ts"

const p = (homeWin: number, draw: number, awayWin: number, actual: Settled["actual"]): Settled => {
  const predicted = homeWin >= draw && homeWin >= awayWin ? "home" : awayWin >= draw ? "away" : "draw"
  return { homeWin, draw, awayWin, predicted, actual }
}

// Certain and right is perfect; certain and wrong is the worst possible.
assert.equal(calibration([p(1, 0, 0, "home")]).brier, 0)
assert.equal(calibration([p(1, 0, 0, "away")]).brier, 2)
assert.equal(calibration([p(1, 0, 0, "home")]).skill, 100)

// A third each scores exactly the coin-flip baseline: no skill.
const flat = calibration([p(1 / 3, 1 / 3, 1 / 3, "draw")])
assert.equal(flat.brier, flat.coinFlip)
assert.equal(flat.skill, 0)

// Bucketed by stated confidence; unsettled matches are ignored.
const c = calibration([
  p(0.7, 0.2, 0.1, "home"),
  p(0.7, 0.2, 0.1, "away"),
  p(0.5, 0.3, 0.2, "home"),
  p(0.9, 0.05, 0.05, null),
])
assert.equal(c.count, 3)
const top = c.buckets.find((b) => b.label === "65%+")!
assert.deepEqual([top.count, top.said, top.hit], [2, 70, 50])
assert.equal(c.buckets.find((b) => b.label === "45–55%")!.hit, 100)
assert.equal(calibration([]).count, 0)
// Percentages (how predictions are stored) score the same as probabilities.
assert.equal(calibration([p(70, 20, 10, "home")]).brier, calibration([p(0.7, 0.2, 0.1, "home")]).brier)

console.log("calibration ok")
