/** Self-check for the matcher: `node lib/providers/match.test.ts` */
import assert from "node:assert/strict"
import { score, threshold, DEFAULT_THRESHOLD } from "./match.ts"
import type { Fixture } from "./types.ts"

const fixture: Fixture = {
  event_id: 16421101,
  home: "Atlético Madrid",
  away: "FC Barcelona",
  league: "La Liga",
  kickoff: "2026-11-08T20:00:00Z",
  date: "2026-11-08",
}

const T = threshold()
assert.equal(T, DEFAULT_THRESHOLD)

// A title-only provider: both teams named, right competition, right time.
assert.ok(
  score(fixture, {
    title: "Atletico Madrid vs Barcelona | LaLiga 2026/27 | Full Match LIVE",
    kickoff: "2026-11-08T20:00:00Z",
  }) >= 0.95,
)

// Aliases and accents both resolve.
for (const title of [
  "Atleti - Barça LIVE",
  "ATLETICO DE MADRID V FC BARCELONA",
  "atletico madrid barcelona",
]) {
  assert.ok(score(fixture, { title, kickoff: fixture.kickoff }) >= T, title)
}

// Structured fields work through the same path, swapped sides included.
assert.ok(
  score(fixture, {
    home: "FC Barcelona",
    away: "Atlético Madrid",
    competition: "La Liga",
    kickoff: fixture.kickoff,
  }) >= T,
)

// Both teams are a gate: the right club, the wrong opponent, never matches —
// even with the competition and the exact kickoff lining up.
assert.equal(
  score(fixture, {
    title: "Barcelona vs Girona — LaLiga",
    kickoff: fixture.kickoff,
  }),
  0,
)
// A shared token is not a team: Real Sociedad must not satisfy Real Madrid.
assert.equal(
  score(
    { ...fixture, home: "Real Madrid" },
    { title: "Real Sociedad vs Barcelona", kickoff: fixture.kickoff },
  ),
  0,
)

// Both teams but a different day: below threshold, so it is not offered.
assert.ok(
  score(fixture, {
    title: "Atletico Madrid vs Barcelona — classic match replay",
    kickoff: "2025-03-01T20:00:00Z",
  }) < T,
)

// Both teams, same day, no competition named: just clears the bar.
assert.ok(score(fixture, { title: "Atletico vs Barcelona", kickoff: "2026-11-08T12:00:00Z" }) >= T)

// Nothing to match on.
assert.equal(score(fixture, {}), 0)
assert.equal(score(fixture, { title: "" }), 0)
assert.equal(score(fixture, { title: "Premier League highlights" }), 0)

// International fixtures matching: full names, 3-letter codes, localized names, competition names
const intlFixture: Fixture = {
  event_id: 15534088,
  home: "England",
  away: "Croatia",
  league: "UEFA Nations League",
  kickoff: "2026-11-12T19:45:00Z",
  date: "2026-11-12",
}

assert.ok(score(intlFixture, { title: "England vs Croatia", kickoff: intlFixture.kickoff }) >= T)
assert.ok(score(intlFixture, { title: "ENG vs CRO", kickoff: intlFixture.kickoff }) >= T)
assert.ok(score(intlFixture, { title: "Hrvatska vs England", kickoff: intlFixture.kickoff }) >= T)
assert.ok(score(intlFixture, { title: "England vs Croatia - UEFA Nations League", kickoff: intlFixture.kickoff }) >= 0.95)

const espGerFixture: Fixture = {
  event_id: 15534090,
  home: "Spain",
  away: "Germany",
  league: "UEFA Nations League",
  kickoff: "2026-11-15T19:45:00Z",
  date: "2026-11-15",
}

assert.ok(score(espGerFixture, { title: "ESP vs GER", kickoff: espGerFixture.kickoff }) >= T)
assert.ok(score(espGerFixture, { title: "España vs Deutschland", kickoff: espGerFixture.kickoff }) >= T)

console.log("providers/match: all assertions passed")
