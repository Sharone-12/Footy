/** Self-check for form summaries: `node lib/form.test.ts` */
import assert from "node:assert/strict"
import { outcomeFor, summarise, streakLabel, type Played } from "./form.ts"

const BARCA = 2817
const m = (
  date: string, home: number, away: number, hg: number | null, ag: number | null,
): Played => ({ date, home_id: home, away_id: away, home_goals: hg, away_goals: ag })

// Home and away are read from the right side of the scoreline.
assert.equal(outcomeFor(m("2026-09-01", BARCA, 9, 3, 0), BARCA), "W")
assert.equal(outcomeFor(m("2026-09-01", 9, BARCA, 3, 0), BARCA), "L")
assert.equal(outcomeFor(m("2026-09-01", 9, BARCA, 1, 1), BARCA), "D")

// A fixture with no score yet is not form, and neither is someone else's game.
assert.equal(outcomeFor(m("2026-09-01", BARCA, 9, null, null), BARCA), null)
assert.equal(outcomeFor(m("2026-09-01", 7, 9, 1, 0), BARCA), null)

const rows = [
  m("2026-08-01", BARCA, 9, 1, 2), // L — falls outside the last 5
  m("2026-08-08", BARCA, 9, 2, 0), // W
  m("2026-08-15", 9, BARCA, 0, 1), // W
  m("2026-08-22", BARCA, 9, 1, 1), // D
  m("2026-08-29", 9, BARCA, 0, 3), // W
  m("2026-09-05", BARCA, 9, 2, 1), // W
  m("2026-09-12", BARCA, 9, null, null), // not played
]

// Input order must not matter.
const form = summarise([...rows].reverse(), BARCA)
assert.deepEqual(form.results, ["W", "W", "D", "W", "W"])
assert.equal(form.gf, 2 + 1 + 1 + 3 + 2)
assert.equal(form.ga, 0 + 0 + 1 + 0 + 1)
assert.deepEqual(form.streak, { type: "W", count: 2 })
assert.equal(streakLabel(form), "2-game winning run")

// The limit is the last N *played*, so the unplayed row never consumes a slot.
assert.equal(summarise(rows, BARCA).results.length, 5)
assert.deepEqual(summarise(rows, BARCA, 3).results, ["D", "W", "W"])
assert.deepEqual(summarise(rows, BARCA, 99).results, ["L", "W", "W", "D", "W", "W"])

// A run of one is not worth a sentence.
assert.equal(streakLabel(summarise([m("2026-08-22", BARCA, 9, 1, 1)], BARCA)), null)
assert.equal(
  streakLabel(summarise([m("2026-08-01", BARCA, 9, 0, 1), m("2026-08-08", 9, BARCA, 2, 0)], BARCA)),
  "Lost 2 in a row",
)

// Nothing played at all.
const empty = summarise([], BARCA)
assert.deepEqual(empty, { results: [], gf: 0, ga: 0, streak: null })
assert.equal(streakLabel(empty), null)

console.log("form: all assertions passed")
