/** Self-check for the scoreline grid reductions: `node lib/scorelines.test.ts` */
import assert from "node:assert/strict"
import { scoreGrid } from "./learn.ts"
import {
  foldScorelines,
  topScoreline,
  likeliestScorelines,
  bandTotals,
} from "./scorelines.ts"

const near = (a: number, b: number, eps = 1e-9) =>
  assert.ok(Math.abs(a - b) < eps, `${a} !~= ${b}`)

const sum = (g: number[][]) =>
  g.reduce((s, r) => s + r.reduce((t, p) => t + p, 0), 0)

// A real grid from the model, and a contrived one where every answer is known
// by hand.
const real = scoreGrid(1.7, 1.1, 0.06)
const toy = [
  [0.1, 0.2, 0.0],
  [0.3, 0.15, 0.05],
  [0.1, 0.05, 0.05],
]

// --- folding conserves probability -----------------------------------------
{
  near(sum(real), 1)
  const folded = foldScorelines(real)
  near(sum(folded.cells), 1, 1e-12)
  assert.equal(folded.cells.length, 7)
  assert.equal(folded.cells[0].length, 7)
  assert.deepEqual(folded.labels, ["0", "1", "2", "3", "4", "5", "6+"])
}

// A fold narrower than the grid must still total the same, and the trailing
// rank must hold exactly what the ranks above the cap were worth.
{
  const folded = foldScorelines(toy, 1)
  near(sum(folded.cells), sum(toy))
  assert.equal(folded.cells.length, 3) // 0, 1, 2+ — the toy grid tops out at 2
  // cell[1][2+] gathers 1–2 only; cell[2+][2+] gathers 2–2.
  near(folded.cells[1][2], 0.05)
  near(folded.cells[2][2], 0.05)
  // cell[2+][0] gathers 2–0.
  near(folded.cells[2][0], 0.1)
}

// Summing the tail rather than cutting it keeps every outcome whole, with one
// bounded exception: `bandTotals` reads a cell by comparing its indices, so the
// folded corner — the only cell holding more than one outcome — is counted
// entirely as a draw, and the 7–6 and 6–7 scorelines inside it are taken off
// the two win totals. Nothing else may move, so the corner's own non-draw mass
// is the whole error budget.
{
  const before = bandTotals(real)
  const folded = foldScorelines(real)
  const after = bandTotals(folded.cells)

  near(before.homeWin + before.draw + before.awayWin, 1)
  near(after.homeWin + after.draw + after.awayWin, 1, 1e-12)

  const last = folded.cells.length - 1
  let cornerNonDraw = 0
  for (let h = last; h < real.length; h++) {
    for (let a = last; a < real[h].length; a++) {
      if (h !== a) cornerNonDraw += real[h][a]
    }
  }

  // The draw total gains exactly what the two win totals lose.
  near(after.draw - before.draw, cornerNonDraw, 1e-12)
  near(
    before.homeWin - after.homeWin + (before.awayWin - after.awayWin),
    cornerNonDraw,
    1e-12,
  )
  // And that budget is small enough that no displayed figure moves: well
  // under a hundredth of a percentage point.
  assert.ok(cornerNonDraw < 1e-4, `corner leak ${cornerNonDraw} too large`)
}

// --- bands ------------------------------------------------------------------
{
  const { bandOf } = foldScorelines(real)
  assert.equal(bandOf(2, 1), "home")
  assert.equal(bandOf(1, 1), "draw")
  assert.equal(bandOf(0, 2), "away")
  // Only one axis folded: the comparison holds at every score it covers.
  assert.equal(bandOf(6, 2), "home")
  assert.equal(bandOf(2, 6), "away")
  // Both folded: 6–6 is a draw, 7–6 is a home win, so the cell is neither.
  assert.equal(bandOf(6, 6), "mixed")
}

// --- picking out scorelines -------------------------------------------------
{
  const top = topScoreline(toy)
  assert.deepEqual(top, { home: 1, away: 0, prob: 0.3 })

  const three = likeliestScorelines(toy, 3)
  assert.equal(three.length, 3)
  assert.deepEqual(
    three.map((s) => `${s.home}-${s.away}`),
    ["1-0", "0-1", "1-1"],
  )
  for (let i = 1; i < three.length; i++) {
    assert.ok(three[i - 1].prob >= three[i].prob)
  }

  // The headline scoreline must be a real one, never the folded rank: on a
  // quiet low-scoring pair it should still land inside the cap.
  const quiet = topScoreline(scoreGrid(0.4, 0.3, 0))
  assert.ok(quiet.home <= 5 && quiet.away <= 5)
  assert.deepEqual([quiet.home, quiet.away], [0, 0])
}

// Asking for more scorelines than exist returns every cell, not undefined
// padding.
{
  const all = likeliestScorelines(toy, 999)
  assert.equal(all.length, 9)
  near(all.reduce((s, c) => s + c.prob, 0), sum(toy))
}

console.log("scorelines: ok")
