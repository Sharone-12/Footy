import assert from "node:assert/strict"
import {
  normalise,
  teamSimilarity,
  leagueSimilarity,
  timeProximityScore,
  computeMatchScore,
  matchFixtureToMatchora,
  CONFIDENCE_REJECT_THRESHOLD,
  CONFIDENCE_CONFIRMED_THRESHOLD,
} from "./matcher.ts"
import type { Fixture } from "../providers/types"
import type { MatchoraParsedEvent } from "./types.ts"

async function runTests() {
  console.log("Running Matchora Matcher unit tests...")

  // 1. Normalization
  assert.equal(normalise("Atlético Madrid"), "atletico madrid")
  assert.equal(normalise("FC Barcelona"), "barcelona")

  // 2. Team similarity with aliases
  const barcaSim = teamSimilarity("FC Barcelona", "Barcelona")
  assert.ok(barcaSim >= 0.95, `Barca similarity should be >= 0.95, got ${barcaSim}`)

  const atletiSim = teamSimilarity("Atlético Madrid", "Atletico Madrid")
  assert.ok(atletiSim >= 0.95, `Atleti similarity should be >= 0.95, got ${atletiSim}`)

  // 3. Strict requirement: both teams must match
  const arsenalVsChelseaSim = teamSimilarity("Arsenal", "Chelsea")
  assert.ok(arsenalVsChelseaSim < 0.65, "Mismatched teams should have low similarity")

  // 4. Test Atlético Madrid vs Barcelona matching
  const fixture: Fixture = {
    event_id: 123456,
    home: "Atlético Madrid",
    away: "Barcelona",
    league: "LaLiga",
    date: "2026-11-08",
    kickoff: "2026-11-08T20:00:00.000Z",
  }

  const matchoraEvent: MatchoraParsedEvent = {
    id: "2506279",
    home: "Atlético Madrid",
    away: "Barcelona",
    league: "Spanish La Liga",
    sport: "Soccer",
    kickoff: 1794168000 * 1000,
    dateIso: "2026-11-08",
    status: "upcoming",
    channelCount: 8,
    channels: [
      {
        id: "118458",
        name: "DAZN 2",
        country: "🇵🇹",
        lang: "Portuguese",
        embedUrl: "https://es.matchora.pro/embed/channel/118458",
      },
    ],
    embedUrl: "https://es.matchora.pro/embed/match/2506279",
  }

  const match = matchFixtureToMatchora(fixture, [matchoraEvent])
  assert.ok(match != null, "Should successfully match Atletico Madrid vs Barcelona")
  assert.ok(match!.confidence >= CONFIDENCE_CONFIRMED_THRESHOLD, `Score should be >= ${CONFIDENCE_CONFIRMED_THRESHOLD}, got ${match!.confidence}`)
  assert.equal(match!.event.id, "2506279")
  assert.equal(match!.event.embedUrl, "https://es.matchora.pro/embed/match/2506279")

  // 5. Test rejection if one team fails
  const fakeFixture: Fixture = {
    event_id: 999,
    home: "Real Madrid",
    away: "Barcelona",
    league: "LaLiga",
    date: "2026-11-08",
    kickoff: "2026-11-08T20:00:00.000Z",
  }
  const rejectedMatch = matchFixtureToMatchora(fakeFixture, [matchoraEvent])
  assert.equal(rejectedMatch, null, "Should reject when home team does not match")

  console.log("✅ All Matchora Matcher unit tests passed!")
}

runTests().catch((err) => {
  console.error("Matchora Matcher test failed:", err)
  process.exit(1)
})
