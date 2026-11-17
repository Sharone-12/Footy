/** Self-check for the season simulator: `node lib/simulate.test.ts` */
import assert from "node:assert/strict"
import {
  rng, poisson, playMatch, simulateRounds, drawBracket, playKnockouts, knockoutRng, sortRows, emptyRow,
  type SimPack,
} from "./simulate.ts"

// Same seed, same sequence; different seeds differ.
assert.deepEqual([rng(7)(), rng(7)()], [rng(7)(), rng(7)()])
assert.notEqual(rng(7)(), rng(8)())

// Poisson draws average out near λ and never explode.
const r = rng(1)
const draws = Array.from({ length: 4000 }, () => poisson(1.6, r))
const mean = draws.reduce((a, b) => a + b, 0) / draws.length
assert.ok(Math.abs(mean - 1.6) < 0.1, `mean ${mean}`)
assert.ok(Math.max(...draws) <= 9)

const squads = {
  A: [{ player: "Striker", slug: "s", goals: 10, assists: 1, minutes: 900 }, { player: "Maker", slug: "m", goals: 1, assists: 8, minutes: 900 }],
  B: [{ player: "Bob", slug: "b", goals: 2, assists: 2, minutes: 500 }],
}
const m = playMatch("A", "B", [3, 0.5], squads, rng(3))
assert.equal(m.goals.length, m.hg + m.ag)
assert.ok(m.goals.every((g) => g.minute >= 1 && g.minute <= 90 && g.scorer !== g.assist))
assert.ok(m.goals.filter((g) => g.team === "A").every((g) => ["Striker", "Maker"].includes(g.scorer!)))

// A league: every fixture of the first n rounds played, games and points add up.
const teams = ["A", "B", "C", "D"]
const fixtures = []
let id = 1
for (let round = 1; round <= 3; round++) {
  fixtures.push(
    { event_id: id++, round, date: `2027-0${round}-01`, home: teams[0], away: teams[(round % 3) + 1], lambda: [1.5, 1.2] as [number, number] },
    { event_id: id++, round, date: `2027-0${round}-01`, home: teams[((round + 1) % 3) + 1], away: teams[((round + 2) % 3) + 1], lambda: [1.3, 1.3] as [number, number] },
  )
}
const pack: SimPack = {
  comp: "league", league: "L", season: "2026/27",
  table: teams.map((t) => ({ ...emptyRow(t), played: 1, won: 1, pts: 3, gf: 1 })),
  fixtures, ids: {}, squads, ratings: {}, avg: 1.4, homeMult: 1.15,
}
const two = simulateRounds(pack, 5, 2)
assert.equal(two.rounds.length, 2)
assert.equal(two.table.reduce((s, t) => s + t.played, 0), 4 + 8)
// Every simulated goal is scored by one side and conceded by the other (the four starting gf are the seed rows).
assert.equal(two.table.reduce((s, t) => s + t.gf, 0) - 4, two.table.reduce((s, t) => s + t.ga, 0))
assert.deepEqual(two.table, sortRows(two.table))
// Deterministic: the same seed replays the same first round.
assert.deepEqual(simulateRounds(pack, 5, 3).rounds[0], two.rounds[0])

// The bracket: 36 seeds, the right bands, opposite halves, a champion at the end.
const order = Array.from({ length: 36 }, (_, i) => `T${i + 1}`)
const bracket = drawBracket(order, rng(9))
assert.equal(bracket.playoffs.length, 8)
assert.deepEqual(bracket.playoffs.map((t) => t.a), ["T9", "T10", "T11", "T12", "T13", "T14", "T15", "T16"])
assert.deepEqual(new Set(bracket.playoffs.slice(0, 2).map((t) => t.b)), new Set(["T23", "T24"]))
const seedsLeft = bracket.r16.slice(0, 4).map((t) => Number(t.a!.slice(1)))
const seedsRight = bracket.r16.slice(4).map((t) => Number(t.a!.slice(1)))
for (let p = 0; p < 4; p++) {
  // One of each pair per half, never both.
  const pair = [1 + 2 * p, 2 + 2 * p]
  assert.equal(seedsLeft.filter((x) => pair.includes(x)).length, 1)
  assert.equal(seedsRight.filter((x) => pair.includes(x)).length, 1)
}
// 1/2 meet 7/8 and 3/4 meet 5/6 in the quarter-finals.
assert.ok([1, 2, 7, 8].includes(seedsLeft[2]) && [1, 2, 7, 8].includes(seedsLeft[3]))
assert.ok([3, 4, 5, 6].includes(seedsLeft[0]) && [3, 4, 5, 6].includes(seedsLeft[1]))

const ucl: SimPack = {
  ...pack, comp: "ucl", league: "Champions League", table: order.map(emptyRow), fixtures: [],
  squads: {}, ratings: Object.fromEntries(order.map((t, i) => [t, { attack: 1.4 - i * 0.02, defence: 0.7 + i * 0.02 }])), avg: 1.7,
}
const drawn = playKnockouts(bracket, 0, ucl, knockoutRng(9))
assert.ok(drawn.r16.every((t) => t.b === null && t.legs.length === 0))
const afterPo = playKnockouts(bracket, 1, ucl, knockoutRng(9))
assert.ok(afterPo.playoffs.every((t) => t.winner && t.legs.length === 2 && t.agg))
assert.ok(afterPo.r16.every((t) => t.b !== null && t.legs.length === 0))
const done = playKnockouts(bracket, 5, ucl, knockoutRng(9))
assert.equal(done.final[0].legs.length, 1)
assert.ok(order.includes(done.final[0].winner!))
assert.ok(done.sf.some((t) => t.winner === done.final[0].winner))
// Replaying fewer stages agrees with the full run up to that point.
assert.deepEqual(playKnockouts(bracket, 3, ucl, knockoutRng(9)).qf, done.qf)

console.log("simulate ok")
