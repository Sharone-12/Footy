/** Self-check for the Barça season maths: `node lib/barca.test.ts` */
import assert from "node:assert/strict"
import { seasonScarf, playedLikeUs, pointsGap, leagueRanks, type SeasonMatch } from "./barca.ts"

const m = (id: number, date: string, home: string, away: string, hg: number | null, ag: number | null): SeasonMatch =>
  ({ event_id: id, league: "L", round: id, date, home, away, home_goals: hg, away_goals: ag })

// Read from the team's side, oldest first, unplayed and other clubs' games dropped.
const scarf = seasonScarf(
  [m(2, "2026-09-02", "X", "B", 2, 2), m(1, "2026-09-01", "B", "X", 3, 0), m(3, "2026-09-03", "X", "B", 1, 0),
   m(4, "2026-09-04", "B", "X", null, null), m(5, "2026-09-05", "X", "Y", 1, 0)],
  "B",
)
assert.deepEqual(scarf.map((s) => s.result), ["W", "D", "L"])
assert.deepEqual([scarf[0].gf, scarf[0].ga, scarf[0].home], [3, 0, true])
assert.equal(scarf[2].opponent, "X")

// Scored against the team's own average: the dominant night is high, the off night low.
const per = new Map<number, Record<string, number>>([
  [1, { poss: 60, passes: 600 }], [2, { poss: 61, passes: 610 }], [3, { poss: 59, passes: 590 }],
  [4, { poss: 75, passes: 800 }], [5, { poss: 40, passes: 350 }],
])
const like = playedLikeUs(per, ["poss", "passes"])
assert.ok(like.get(4)! > 70 && like.get(5)! < 20)
assert.ok(Math.abs(like.get(1)! - 50) < 10)
assert.equal(playedLikeUs(new Map([[1, { poss: 60 }]]), ["poss"]).size, 0, "too few matches to say")

// Positive gap is ahead; the deserved line tracks the first rival.
const gap = pointsGap(
  { teams: ["A", "B", "C"], rounds: [1, 2], points: [[3, 3, 0], [3, 6, 1]] },
  [[1.2, 2, 1], [2.5, 3.1, 2]],
  "B",
  ["A", "C", "nobody"],
)!
assert.deepEqual(gap.rivals.map((r) => r.gap), [[0, 3], [3, 5]])
assert.deepEqual(gap.deserved, [0.8, 0.6])
assert.equal(pointsGap({ teams: ["A"], rounds: [1], points: [[3]] }, [[1]], "B", ["A"]), null)

// Rank 1 is best in whichever direction is good.
const ranks = leagueRanks(
  "B",
  [{ team: "A", metrics: { gf: 2, ga: 0.5 } }, { team: "B", metrics: { gf: 3, ga: 1.5 } }, { team: "C", metrics: { gf: 1, ga: 1 } }],
  [{ key: "gf", label: "Goals", better: "high", fmt: String }, { key: "ga", label: "Conceded", better: "low", fmt: String }],
)
assert.deepEqual(ranks.map((r) => [r.label, r.rank, r.of]), [["Goals", 1, 3], ["Conceded", 3, 3]])

console.log("barca ok")
