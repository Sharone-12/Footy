/**
 * Unit tests for Cinevid Match Association Engine.
 * Run with: npx tsx lib/cinevid/matcher.test.ts
 */

import assert from "node:assert/strict"
import {
  normalise,
  teamSimilarity,
  computeMatchScore,
  matchFixtureToCinevid,
  matchFixturesToCinevid,
  CONFIDENCE_REJECT_THRESHOLD,
  CONFIDENCE_CONFIRMED_THRESHOLD,
} from "./matcher"
import type { Fixture } from "@/lib/providers/types"
import type { CinevidParsedEvent } from "./types"

async function runTests() {
  console.log("Running Cinevid Matcher unit tests...")

  // 1. Text Normalization
  assert.equal(normalise("FC Barcelona"), "barcelona")
  assert.equal(normalise("Atlético de Madrid"), "atletico madrid")
  assert.equal(normalise("Deportivo Alavés"), "deportivo alaves")
  assert.equal(normalise("Rangers FC"), "rangers")
  assert.equal(normalise("St Mirren FC"), "st mirren")

  // 2. Team Similarity & Alias Lookup
  assert.equal(teamSimilarity("FC Barcelona", "Barca") >= 0.95, true, "Alias 'Barca' matches 'FC Barcelona'")
  assert.equal(teamSimilarity("Real Madrid CF", "Los Blancos") >= 0.95, true, "Alias 'Los Blancos' matches Real Madrid")
  assert.equal(teamSimilarity("St Mirren", "Saint Mirren") >= 0.95, true, "Alias 'Saint Mirren' matches St Mirren")
  assert.equal(teamSimilarity("Arsenal", "Chelsea") < 0.5, true, "Unrelated teams must have low similarity")

  // 3. Both Teams Must Match Rule
  const fixtureBarcaAtleti: Fixture = {
    event_id: 1001,
    home: "FC Barcelona",
    away: "Atlético Madrid",
    league: "La Liga",
    kickoff: "2026-11-07T20:00:00.000Z",
    date: "2026-11-07",
  }

  // Event where only Barcelona matches, away is Chelsea
  const eventOneTeamMatch: CinevidParsedEvent = {
    id: "cv_one_match",
    slug: "barca-vs-chelsea",
    title: "FC Barcelona vs Chelsea",
    sport: "Football",
    home: "Barcelona",
    away: "Chelsea",
    league: "Champions League",
    utcDate: "2026-11-07",
    utcTime: "20:00",
    kickoffIso: "2026-11-07T20:00:00.000Z",
    kickoffTimestampMs: new Date("2026-11-07T20:00:00.000Z").getTime(),
    status: "LIVE",
    isLive: true,
    score: null,
    round: null,
    venue: null,
    homeTeamImage: null,
    awayTeamImage: null,
    thumbnail: null,
    playerUrl: "https://cinevid.st/embed/live/cv_one_match",
  }

  const scoreOneTeam = computeMatchScore(fixtureBarcaAtleti, eventOneTeamMatch)
  assert.equal(
    scoreOneTeam.confidence,
    0,
    "Strict rule: Single team match must be rejected with confidence 0",
  )

  // 4. High Confidence Confirmed Match (Both teams + Time + League match)
  const eventBothTeamsMatch: CinevidParsedEvent = {
    ...eventOneTeamMatch,
    id: "cv_both_match",
    slug: "barca-vs-atleti",
    title: "Barca vs Atletico Madrid",
    home: "Barca",
    away: "Atletico Madrid",
    league: "La Liga",
  }

  const scoreBoth = computeMatchScore(fixtureBarcaAtleti, eventBothTeamsMatch)
  assert.ok(
    scoreBoth.confidence >= CONFIDENCE_CONFIRMED_THRESHOLD,
    `Confidence should be >= ${CONFIDENCE_CONFIRMED_THRESHOLD}, got ${scoreBoth.confidence}`,
  )
  assert.equal(scoreBoth.isConfirmed, true, "Match should be confirmed")

  // 5. Date Mismatch (Event on different day / week)
  const eventDifferentDay: CinevidParsedEvent = {
    ...eventBothTeamsMatch,
    utcDate: "2026-11-20",
    utcTime: "20:00",
    kickoffIso: "2026-11-20T20:00:00.000Z",
    kickoffTimestampMs: new Date("2026-11-20T20:00:00.000Z").getTime(),
  }

  const scoreDiffDay = computeMatchScore(fixtureBarcaAtleti, eventDifferentDay)
  assert.equal(scoreDiffDay.confidence, 0, "Matches more than 24 hours apart must be rejected")

  // 6. matchFixtureToCinevid Threshold Enforcement
  const matched = matchFixtureToCinevid(fixtureBarcaAtleti, [
    eventOneTeamMatch,
    eventDifferentDay,
    eventBothTeamsMatch,
  ])
  assert.ok(matched, "Should match the correct event")
  assert.equal(matched.event.id, "cv_both_match")
  assert.equal(matched.isConfirmedMatch, true)
  assert.ok(matched.confidence >= 85)

  // 7. Batch Matching
  const fixtureRangers: Fixture = {
    event_id: 1002,
    home: "St. Mirren",
    away: "Glasgow Rangers",
    league: "Scottish Premiership",
    kickoff: "2026-11-07T15:00:00.000Z",
    date: "2026-11-07",
  }

  const eventRangers: CinevidParsedEvent = {
    id: "002993891",
    slug: "st-mirren-vs-rangers",
    title: "St Mirren vs Rangers",
    sport: "Football",
    home: "St Mirren",
    away: "Rangers",
    league: "Scottish Premier League",
    utcDate: "2026-11-07",
    utcTime: "15:00",
    kickoffIso: "2026-11-07T15:00:00.000Z",
    kickoffTimestampMs: new Date("2026-11-07T15:00:00.000Z").getTime(),
    status: "LIVE",
    isLive: true,
    score: null,
    round: null,
    venue: null,
    homeTeamImage: null,
    awayTeamImage: null,
    thumbnail: null,
    playerUrl: "https://cinevid.st/embed/live/002993891",
  }

  const batchMap = matchFixturesToCinevid(
    [fixtureBarcaAtleti, fixtureRangers],
    [eventBothTeamsMatch, eventRangers],
  )
  assert.equal(batchMap.size, 2)
  assert.equal(batchMap.get(1001)?.event.id, "cv_both_match")
  assert.equal(batchMap.get(1002)?.event.id, "002993891")

  console.log("Cinevid Matcher tests passed cleanly!")
}

runTests().catch((err) => {
  console.error("Cinevid Matcher test failed:", err)
  process.exit(1)
})
