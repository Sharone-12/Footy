/** Self-check for the justice table and table race: `node lib/justice.test.ts` */
import assert from "node:assert/strict"
import { expectedPoints, justiceTable, tableRace, type TableMatch } from "./justice.ts"

// Even chances split the points evenly, and a match is worth between 2 and 3.
const [eh, ea] = expectedPoints(1.2, 1.2)
assert.ok(Math.abs(eh - ea) < 1e-9)
assert.ok(eh + ea > 2 && eh + ea < 3)
// The side with the better chances expects more.
const [dh, da] = expectedPoints(2.5, 0.4)
assert.ok(dh > 2.2 && da < 0.6)

const m = (id: number, round: number, home: string, away: string, hg: number | null, ag: number | null): TableMatch =>
  ({ event_id: id, league: "L", round, home, away, home_goals: hg, away_goals: ag })
const matches = [
  m(1, 1, "A", "B", 1, 0), // A wins on the scoreboard, loses on chances
  m(2, 2, "B", "A", 2, 2),
  m(3, 2, "C", "A", 0, 0), // no xG: ignored by justice, counted by the race
  m(4, 3, "A", "B", null, null), // unplayed
]
const xg = new Map<number, [number, number]>([[1, [0.3, 2.4]], [2, [1, 1]]])

const rows = justiceTable(matches, xg)
const A = rows.find((r) => r.team === "A")!
const B = rows.find((r) => r.team === "B")!
assert.equal(A.played, 2)
assert.equal(A.points, 4)
assert.ok(A.luck > 0 && B.luck < 0, "A ran ahead of its chances, B behind")
assert.equal(A.rank, 1)
assert.equal(B.xRank, 1)
assert.ok(!rows.some((r) => r.team === "C"), "a club with no xG matches has no row")

const race = tableRace(matches, "L")!
assert.deepEqual(race.rounds, [1, 2])
assert.deepEqual(race.teams, ["A", "B", "C"])
assert.deepEqual(race.points, [[3, 0, 0], [5, 1, 1]])
assert.deepEqual(race.gd.at(-1), [1, -1, 0])
assert.equal(tableRace(matches, "nowhere"), null)

console.log("justice ok")
