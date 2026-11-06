/** Self-check for role leaderboards: `node lib/leaders.test.ts` */
import assert from "node:assert/strict"
import { rank, cell, num, ROLE_SPECS, MIN_MINUTES, type Ranked } from "./leaders.ts"

const spec = ROLE_SPECS.find((s) => s.role === "Striker")!
const gk = ROLE_SPECS.find((s) => s.role === "Goalkeeper")!

const p = (name: string, role: string, minutes: number, xg_p90: unknown): Ranked => ({
  player_id: name.length,
  player: name,
  slug: name.toLowerCase(),
  role,
  minutes,
  xg_p90,
})

const squad = [
  p("Striker A", "Striker", 900, 0.72),
  p("Striker B", "Striker", 900, 0.91),
  p("Cameo", "Striker", 60, 2.5), // under the minutes floor — one lucky sub
  p("Unrecorded", "Striker", 900, null),
  p("Winger X", "Winger", 900, 0.4), // wrong role
]

const board = rank(squad, spec)
assert.deepEqual(board.map((r) => r.player), ["Striker B", "Striker A", "Unrecorded"])

// The floor applies to p90 headlines only; a counting headline keeps everyone.
assert.equal(rank(squad, spec).some((r) => r.player === "Cameo"), false)
assert.equal(MIN_MINUTES, 180)
const gkBoard = rank(
  [p("Keeper", "Goalkeeper", 90, null), p("Backup", "Goalkeeper", 900, null)],
  gk,
)
assert.deepEqual(gkBoard.map((r) => r.player), ["Backup", "Keeper"])

// A missing value sorts last, never as a zero that outranks a real zero.
const zeroes = rank(
  [p("Zero", "Striker", 900, 0), p("Missing", "Striker", 900, null)],
  spec,
)
assert.deepEqual(zeroes.map((r) => r.player), ["Zero", "Missing"])

// Formatting distinguishes "none" from "not recorded".
assert.equal(cell(0, { col: "x", label: "x", digits: 2 }), "0.00")
assert.equal(cell(null, { col: "x", label: "x", digits: 2 }), "—")
assert.equal(cell("", { col: "x", label: "x" }), "—")
assert.equal(cell(3.456, { col: "x", label: "x", digits: 1 }), "3.5")
assert.equal(cell(7, { col: "x", label: "x" }), "7")
assert.equal(num("1.5"), 1.5)
assert.equal(num("abc"), null)

// Every spec names real, distinct columns.
for (const s of ROLE_SPECS) {
  const cols = [s.headline.col, ...s.columns.map((c) => c.col)]
  assert.equal(new Set(cols).size, cols.length, s.role)
}
assert.equal(new Set(ROLE_SPECS.map((s) => s.role)).size, ROLE_SPECS.length)

console.log("leaders: all assertions passed")

// ── Combining a player's per-competition rows ──
import { combineCompetitions } from "./leaders.ts"

const liga = {
  player_id: 1, slug: "raphinha", player: "Raphinha", league: "La Liga",
  minutes: 723, goals: 15, assists: 3, goals_p90: 1.87, assists_p90: 0.37,
}
const ucl = {
  player_id: 1, slug: "raphinha", player: "Raphinha", league: "Champions League",
  minutes: 201, goals: 4, assists: 0, goals_p90: 1.79, assists_p90: 0,
}

const [combined] = combineCompetitions([ucl, liga])
assert.equal(combined.minutes, 924)
assert.equal(combined.goals, 19)
assert.equal(combined.assists, 3)
// Rates are recomputed from the sums, never averaged: 19/924*90.
assert.ok(Math.abs((combined.goals_p90 as number) - (19 / 924) * 90) < 1e-9)
assert.ok(Math.abs((combined.assists_p90 as number) - (3 / 924) * 90) < 1e-9)
// Identity comes from the competition with the most minutes.
assert.equal(combined.league, "La Liga")

// One player, one row out — this is what stops a cohort double-counting.
assert.equal(combineCompetitions([liga, ucl]).length, 1)
assert.equal(combineCompetitions([liga]).length, 1)
assert.equal(combineCompetitions([]).length, 0)

// Two different players stay separate.
assert.equal(combineCompetitions([liga, { ...ucl, player_id: 2 }]).length, 2)

// A column no row carries is not invented as a zero.
assert.equal("clearances" in combineCompetitions([liga, ucl])[0], false)

// Zero minutes must not divide by zero.
const z = combineCompetitions([
  { player_id: 9, minutes: 0, goals: 0, goals_p90: 0 },
  { player_id: 9, minutes: 0, goals: 0, goals_p90: 0 },
])[0]
assert.equal(z.goals_p90, 0)

console.log("leaders/combine: all assertions passed")
