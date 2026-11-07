/** Self-check for live scores and the match clock: `node lib/livescores.test.ts` */
import assert from "node:assert/strict"
import {
  findLive, matchClock, normalizeLive, normalizeTeam, parseEsd,
  parseStatusMinute, sameTeams,
  type LiveScore,
} from "./livescores.ts"

const base: LiveScore = {
  id: "1", league: "Bundesliga 2", home: "Holstein Kiel", away: "Arminia Bielefeld",
  homeGoals: 0, awayGoals: 1, status: "28'", period: 1,
  clock: null, kickoffMs: Date.UTC(2026, 10, 7, 12, 0, 0),
}
const at = (elapsedMs: number, atMs: number, over: Partial<LiveScore> = {}): LiveScore =>
  ({ ...base, clock: { elapsedMs, atMs }, ...over })

/* ── the clock ─────────────────────────────────────────────────────────── */

// Observed live: RTm 27:00 taken 50s ago displayed as 28'.
{
  const now = 1_794_054_511_042
  const r = matchClock(at(1_620_000, now - 50_000), now)
  assert.equal(r.display, "28'")
  assert.equal(r.minute, 28)
  assert.equal(r.running, true)
}

// It advances on its own between polls: no refetch should be needed to tick.
{
  const now = 1_700_000_000_000
  const score = at(10 * 60_000, now, { status: "11'" })
  assert.equal(matchClock(score, now).display, "11'")
  assert.equal(matchClock(score, now + 60_000).display, "12'")
  assert.equal(matchClock(score, now + 120_000).display, "13'")
}

// No clock reference means the clock is stopped; the feed's label is the truth.
{
  const r = matchClock({ ...base, status: "HT", clock: null }, Date.now())
  assert.equal(r.display, "HT")
  assert.equal(r.minute, null)
  assert.equal(r.running, false)
}

// The bug the live run exposed: against the real feed a match displaying 42'
// extrapolated to 44', because its clock had stopped while the reference kept
// ageing. The drift stays under the period cap, so staleness is what catches
// it — past the threshold the feed's label wins.
{
  const now = 1_700_000_000_000
  const drifting = at(41 * 60_000, now - 150_000, { status: "42'" })
  const r = matchClock(drifting, now)
  assert.equal(r.display, "42'", "a stale reference must not be extrapolated")
  assert.equal(r.running, false)
  assert.equal(r.minute, null)
}
// Just inside the staleness window still ticks.
{
  const now = 1_700_000_000_000
  const fresh = at(41 * 60_000, now - 100_000, { status: "42'" })
  assert.equal(matchClock(fresh, now).running, true)
  assert.equal(matchClock(fresh, now).display, "43'")
}
// First half running past 45 with the feed still on 45' shows "45+".
{
  const now = 1_700_000_000_000
  const r = matchClock(at(46 * 60_000, now, { status: "45'" }), now)
  assert.equal(r.display, "45+")
  assert.equal(r.minute, 45)
}
// The live-feed bug: `Epr` was 1 for matches in the 71st and 86th minute, so
// capping by it showed "45+" for two thirds of all running matches. The
// boundary must come from the feed's displayed minute instead.
{
  const now = 1_700_000_000_000
  const second = at(70 * 60_000, now, { status: "71'", period: 1 })
  assert.equal(matchClock(second, now).display, "71'")
  const late = at(85 * 60_000, now, { status: "86'", period: 1 })
  assert.equal(matchClock(late, now).display, "86'")
}
// Second half caps at 90, extra time at 105/120.
{
  const now = 1_700_000_000_000
  assert.equal(matchClock(at(94 * 60_000, now, { status: "89'" }), now).display, "90+")
  assert.equal(matchClock(at(80 * 60_000, now, { status: "81'" }), now).display, "81'")
  assert.equal(matchClock(at(100 * 60_000, now, { status: "99'" }), now).display, "101'")
}
// Added time is shown verbatim, never extrapolated through.
{
  const now = 1_700_000_000_000
  for (const status of ["45+", "90+2'", "45+3'"]) {
    const r = matchClock(at(50 * 60_000, now, { status }), now)
    assert.equal(r.display, status, `${status} must pass through`)
    assert.equal(r.running, false)
  }
}
// A non-minute label (break, penalties) is not a clock.
assert.equal(matchClock(at(50 * 60_000, 1e12, { status: "BT" }), 1e12).display, "BT")
// The tick never runs behind the feed's own minute.
{
  const now = 1_700_000_000_000
  assert.equal(matchClock(at(10 * 60_000, now, { status: "30'" }), now).minute, 30)
}

/* ── status parsing ─────────────────────────────────────────────────────── */

assert.deepEqual(parseStatusMinute("28'"), { minute: 28, added: false })
assert.deepEqual(parseStatusMinute("45+"), { minute: 45, added: true })
assert.deepEqual(parseStatusMinute("90+2'"), { minute: 90, added: true })
assert.equal(parseStatusMinute("HT"), null)
assert.equal(parseStatusMinute("BT"), null)
assert.equal(parseStatusMinute(""), null)
// Never a zeroth or negative minute if a reference arrives slightly ahead.
{
  const now = Date.now()
  assert.equal(matchClock(at(0, now + 5_000, { status: "1'" }), now).minute, 1)
}

/* ── team-name normalisation ────────────────────────────────────────────── */

assert.equal(normalizeTeam("Liverpool FC"), normalizeTeam("Liverpool"))
assert.equal(normalizeTeam("FC Bayern München"), normalizeTeam("Bayern Munchen"))
assert.equal(normalizeTeam("Paris Saint-Germain"), normalizeTeam("Paris Saint Germain"))
assert.equal(normalizeTeam("SC Freiburg W"), normalizeTeam("Freiburg W"))
// Distinct clubs must stay distinct.
assert.notEqual(normalizeTeam("Newcastle United"), normalizeTeam("Newcastle Jets"))
assert.notEqual(normalizeTeam("Manchester United"), normalizeTeam("Manchester City"))
// A name made only of club-type tokens still yields something.
assert.ok(normalizeTeam("FC").length > 0)

/* ── matching ───────────────────────────────────────────────────────────── */

const fixture = {
  home: "Holstein Kiel", away: "Arminia Bielefeld",
  kickoff: "2026-11-07T12:00:00Z", date: "2026-11-07",
}

// Both teams agree -> matched.
assert.equal(findLive(fixture, [base])?.id, "1")

// One side wrong -> no match, rather than a confident mispair.
assert.equal(findLive({ ...fixture, away: "Hamburger SV" }, [base]), null)

// The trap: a shared first word must not pair two different matches.
assert.equal(sameTeams(
  { home: "Newcastle United", away: "Arsenal" },
  { home: "Newcastle Jets", away: "Arsenal" },
), false)

// Right teams, wrong day -> different fixture in the same tie.
assert.equal(findLive({ ...fixture, kickoff: "2026-11-21T12:00:00Z" }, [base]), null)

// A date-only fixture still matches a same-day kickoff.
assert.equal(
  findLive({ home: "Holstein Kiel", away: "Arminia Bielefeld", kickoff: null, date: "2026-11-07" },
           [base])?.id,
  "1",
)

/* ── feed parsing ───────────────────────────────────────────────────────── */

assert.equal(parseEsd("20261107120000"), Date.UTC(2026, 10, 7, 12, 0, 0))
assert.equal(parseEsd("nonsense"), null)
assert.equal(parseEsd(undefined), null)

{
  const payload = {
    Ts: 1_794_054_461,
    Stages: [{
      Cnm: "Bundesliga 2",
      Events: [
        {
          Eid: "1813398", Eps: "28'", Epr: 1, Tr1: "0", Tr2: "1",
          Esd: 20261107120000,
          Etm: { ATm: 1_794_054_461_042, RTm: 1_620_000 },
          T1: [{ Nm: "Holstein Kiel" }], T2: [{ Nm: "Arminia Bielefeld" }],
        },
        { Eid: "2", Eps: "FT", T1: [{ Nm: "A" }], T2: [{ Nm: "B" }] },
        { Eid: "3", Eps: "NS", T1: [{ Nm: "C" }], T2: [{ Nm: "D" }] },
        // In play but between periods: kept, with no clock.
        { Eid: "4", Eps: "HT", Epr: 1, Tr1: "2", Tr2: "2",
          T1: [{ Nm: "E" }], T2: [{ Nm: "F" }] },
      ],
    }],
  }
  const rows = normalizeLive(payload)
  assert.equal(rows.length, 2, "finished and not-started rows are dropped")
  const [live, halftime] = rows
  assert.equal(live.home, "Holstein Kiel")
  assert.equal(live.awayGoals, 1)
  assert.equal(live.league, "Bundesliga 2")
  assert.deepEqual(live.clock, { elapsedMs: 1_620_000, atMs: 1_794_054_461_042 })
  assert.equal(halftime.clock, null, "a paused match carries no clock")
  assert.equal(matchClock(halftime, Date.now()).display, "HT")
}

// Junk in, empty out — never a throw on a shape change upstream.
assert.deepEqual(normalizeLive(null), [])
assert.deepEqual(normalizeLive({}), [])
assert.deepEqual(normalizeLive({ Stages: "nope" }), [])
assert.deepEqual(normalizeLive({ Stages: [{ Cnm: "X" }] }), [])

console.log("livescores: all assertions passed")
