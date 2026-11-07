/** Self-check for full-time settling: `node lib/live/settle.test.ts`
 *
 * These guard the rules that decide whether a scoreline gets written to the
 * database. A wrong write is not erased by the next poll, so the bar here is
 * higher than it is for the live scoreboard.
 */
import assert from "node:assert/strict"
import {
  pickSettlements, MIN_AGE_MS, KICKOFF_SLACK_MS,
  type OurMatch,
} from "./settle.ts"
import { normalizeFinal, type LiveScore } from "../livescores.ts"

const NOW = Date.UTC(2026, 10, 7, 23, 0, 0)
const KICKOFF = Date.UTC(2026, 10, 7, 20, 0, 0) // three hours before NOW

const ours = (over: Partial<OurMatch> = {}): OurMatch => ({
  event_id: 1,
  date: "2026-11-07",
  kickoff: new Date(KICKOFF).toISOString(),
  home: "Inter",
  away: "AC Milan",
  ...over,
})

const feed = (over: Partial<LiveScore> = {}): LiveScore => ({
  id: "9", league: "Serie A", home: "Inter", away: "AC Milan",
  homeGoals: 2, awayGoals: 1, status: "FT", period: null,
  clock: null, kickoffMs: KICKOFF,
  ...over,
})

/* ── the happy path ─────────────────────────────────────────────────────── */

assert.deepEqual(pickSettlements([ours()], [feed()], NOW), [
  { event_id: 1, home_goals: 2, away_goals: 1 },
])

// A 0-0 must still be written: falsy goals are a result, not a missing one.
assert.deepEqual(
  pickSettlements([ours()], [feed({ homeGoals: 0, awayGoals: 0 })], NOW),
  [{ event_id: 1, home_goals: 0, away_goals: 0 }],
)

// Club-type noise differs between sources and must not block a match.
assert.equal(
  pickSettlements([ours({ home: "FC Internazionale" })],
    [feed({ home: "Internazionale" })], NOW).length,
  1,
)

/* ── what must never be written ─────────────────────────────────────────── */

// Too soon after kickoff: an FT row this early belongs to another match.
assert.deepEqual(
  pickSettlements([ours()], [feed()], KICKOFF + MIN_AGE_MS - 60_000),
  [],
)

// Kickoffs too far apart — the other leg of a tie, not this fixture.
assert.deepEqual(
  pickSettlements([ours()], [feed({ kickoffMs: KICKOFF + KICKOFF_SLACK_MS + 1 })], NOW),
  [],
)

// Only one side matches. findLive would accept this on similarity; a write
// must not.
assert.deepEqual(pickSettlements([ours()], [feed({ away: "Juventus" })], NOW), [])

// Two feed rows fit: we cannot tell them apart, so neither is written.
assert.deepEqual(
  pickSettlements([ours()], [feed(), feed({ id: "10", homeGoals: 3 })], NOW),
  [],
)

// No kickoff on our row leaves no safe window to match within.
assert.deepEqual(pickSettlements([ours({ kickoff: null })], [feed()], NOW), [])
assert.deepEqual(pickSettlements([ours({ kickoff: "not a date" })], [feed()], NOW), [])

// A feed row with no score is not a result.
assert.deepEqual(pickSettlements([ours()], [feed({ homeGoals: null })], NOW), [])

// Nothing finished, nothing to do.
assert.deepEqual(pickSettlements([ours()], [], NOW), [])

/* ── which statuses count as final ──────────────────────────────────────── */

const payload = {
  Stages: [{
    Cnm: "Serie A",
    Events: [
      { Eid: "1", Eps: "FT",  T1: [{ Nm: "Inter" }],  T2: [{ Nm: "AC Milan" }], Tr1: "2", Tr2: "1", Esd: "20261107200000" },
      { Eid: "2", Eps: "AET", T1: [{ Nm: "Roma" }],   T2: [{ Nm: "Lazio" }],    Tr1: "1", Tr2: "0", Esd: "20261107200000" },
      { Eid: "3", Eps: "AP",  T1: [{ Nm: "Napoli" }], T2: [{ Nm: "Parma" }],    Tr1: "1", Tr2: "1", Esd: "20261107200000" },
      { Eid: "4", Eps: "67'", T1: [{ Nm: "Como" }],   T2: [{ Nm: "Torino" }],   Tr1: "0", Tr2: "0", Esd: "20261107200000" },
      { Eid: "5", Eps: "NS",  T1: [{ Nm: "Genoa" }],  T2: [{ Nm: "Empoli" }],   Esd: "20261107200000" },
    ],
  }],
}
// FT and AET settle; a shootout is left for the scraper, and in-play and
// not-started rows are obviously not results.
assert.deepEqual(normalizeFinal(payload).map((r) => r.id), ["1", "2"])
assert.deepEqual(normalizeFinal(null), [])

console.log("ok  settle: all good")
