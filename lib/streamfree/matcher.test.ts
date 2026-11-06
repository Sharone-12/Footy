import assert from "node:assert/strict"
import {
  normalise,
  teamSimilarity,
  competitionMatch,
  scoreMatch,
  matchFixtureToStream,
  matchFixtures,
  resolveStreamStatus,
  sortQualities,
  CONFIDENCE_THRESHOLD,
} from "./matcher.ts"
import type { Fixture } from "../providers/types.ts"
import type { StreamFreeItem } from "./types.ts"

// ── 1. Team name normalization & similarity tests ──

assert.equal(normalise("FC Barcelona"), "fc barcelona")
assert.equal(normalise("Deportivo Alavés!"), "deportivo alaves")
assert.equal(normalise("Borussia Mönchengladbach"), "borussia monchengladbach")

// Exact alias matches
assert.ok(teamSimilarity("FC Barcelona", "Barça") >= 0.95)
assert.ok(teamSimilarity("Barcelona", "FCB") >= 0.95)
assert.ok(teamSimilarity("Deportivo Alavés", "Alavés") >= 0.95)
assert.ok(teamSimilarity("Sevilla FC", "Sevilla") >= 0.95)
assert.ok(teamSimilarity("Borussia Mönchengladbach", "Gladbach") >= 0.95)
assert.ok(teamSimilarity("Coventry City", "Coventry") >= 0.95)
assert.ok(teamSimilarity("Udinese Calcio", "Udinese") >= 0.95)
assert.ok(teamSimilarity("Paris Saint-Germain", "PSG") >= 0.95)

// Different teams should have very low similarity
assert.ok(teamSimilarity("FC Barcelona", "Real Madrid") < 0.4)
assert.ok(teamSimilarity("Sevilla", "Real Betis") < 0.4)
assert.ok(teamSimilarity("Udinese", "Venezia") < 0.4)

// ── 2. Competition matching ──

assert.ok(competitionMatch("La Liga", "La Liga"))
assert.ok(competitionMatch("La Liga", "laliga"))
assert.ok(competitionMatch("Premier League", "EPL"))
assert.ok(competitionMatch("Bundesliga", "german league"))
assert.ok(competitionMatch("Serie A", "Italian League"))
assert.ok(!competitionMatch("La Liga", "Premier League"))

// ── 3. Match association engine ──

const sampleFixture: Fixture = {
  event_id: 101,
  home: "Deportivo Alavés",
  away: "Sevilla FC",
  league: "La Liga",
  kickoff: "2026-11-06T20:00:00Z",
  date: "2026-11-06",
}

const matchingStream: StreamFreeItem = {
  id: "alaves-vs-sevilla",
  name: "Alavés vs Sevilla",
  category: "soccer",
  league: "La Liga",
  stream_key: "alavés-vs-sevilla",
  match_timestamp: Date.parse("2026-11-06T20:00:00Z") / 1000,
  sources: [
    { quality: "FHD", url: "https://strmfree.st/embed/soccer/alaves1080p", live: true },
    { quality: "SD", url: "https://strmfree.st/embed/soccer/alaves540p", live: true },
  ],
  team1: { name: "Alavés" },
  team2: { name: "Sevilla" },
}

const matchResult = scoreMatch(sampleFixture, matchingStream)
assert.ok(
  matchResult.confidence >= CONFIDENCE_THRESHOLD,
  `Expected confidence >= ${CONFIDENCE_THRESHOLD}, got ${matchResult.confidence}`,
)
assert.equal(matchResult.matchedTeams.home, "Alavés")
assert.equal(matchResult.matchedTeams.away, "Sevilla")

// ── 4. Requirement: BOTH teams must match ──

// Case A: Home matches, Away doesn't
const partialStreamA: StreamFreeItem = {
  name: "Alavés vs Real Madrid",
  category: "soccer",
  league: "La Liga",
  stream_key: "alaves-vs-madrid",
  match_timestamp: Date.parse("2026-11-06T20:00:00Z") / 1000,
  sources: [{ quality: "HD", url: "https://strmfree.st/embed/test", live: true }],
}
const partialResultA = scoreMatch(sampleFixture, partialStreamA)
assert.equal(partialResultA.confidence, 0, "Partial team match (home only) must score 0")

// Case B: Away matches, Home doesn't
const partialStreamB: StreamFreeItem = {
  name: "Valencia vs Sevilla",
  category: "soccer",
  league: "La Liga",
  stream_key: "valencia-vs-sevilla",
  match_timestamp: Date.parse("2026-11-06T20:00:00Z") / 1000,
  sources: [{ quality: "HD", url: "https://strmfree.st/embed/test", live: true }],
}
const partialResultB = scoreMatch(sampleFixture, partialStreamB)
assert.equal(partialResultB.confidence, 0, "Partial team match (away only) must score 0")

// ── 5. Requirement: Kickoff time proximity verification ──

// Same teams but scheduled 3 days later
const futureStream: StreamFreeItem = {
  ...matchingStream,
  match_timestamp: Date.parse("2026-11-10T20:00:00Z") / 1000, // 4 days later
}
const futureResult = scoreMatch(sampleFixture, futureStream)
assert.equal(futureResult.confidence, 0, "Match on different date must be rejected")

// ── 6. Stream status & quality resolution ──

// Live stream with FHD and SD
const statusLive = resolveStreamStatus(matchingStream)
assert.equal(statusLive.status, "LIVE")
assert.equal(statusLive.isLive, true)
assert.deepEqual(statusLive.availableQualities, ["FHD", "SD"])
assert.equal(statusLive.bestSource?.quality, "FHD")

// Stream with live: false and future kickoff -> UPCOMING
const upcomingStream: StreamFreeItem = {
  ...matchingStream,
  match_timestamp: Math.floor(Date.now() / 1000) + 7200, // in 2 hours
  sources: [
    { quality: "4K", url: "https://strmfree.st/embed/4k", live: false },
    { quality: "HD", url: "https://strmfree.st/embed/hd", live: false },
  ],
}
const statusUpcoming = resolveStreamStatus(upcomingStream)
assert.equal(statusUpcoming.status, "UPCOMING")
assert.equal(statusUpcoming.isLive, false)
assert.deepEqual(statusUpcoming.availableQualities, ["4K", "HD"])
assert.equal(statusUpcoming.bestSource?.quality, "4K")

// Stream with live: false and past kickoff -> OFFLINE
const offlineStream: StreamFreeItem = {
  ...matchingStream,
  match_timestamp: Math.floor(Date.now() / 1000) - 7200, // 2 hours ago
  sources: [
    { quality: "SD", url: "https://strmfree.st/embed/sd", live: false },
  ],
}
const statusOffline = resolveStreamStatus(offlineStream)
assert.equal(statusOffline.status, "OFFLINE")
assert.equal(statusOffline.isLive, false)

// Quality sorting
assert.deepEqual(sortQualities(["SD", "4K", "HD", "FHD"]), ["4K", "FHD", "HD", "SD"])

// ── 7. Batch matching test ──

const fixtures: Fixture[] = [
  sampleFixture,
  {
    event_id: 102,
    home: "Borussia Mönchengladbach",
    away: "Hamburg SV",
    league: "Bundesliga",
    kickoff: "2026-11-06T19:30:00Z",
    date: "2026-11-06",
  },
  {
    event_id: 103,
    home: "Arsenal",
    away: "Chelsea",
    league: "Premier League",
    kickoff: "2026-11-06T19:30:00Z",
    date: "2026-11-06",
  },
]

const streams: StreamFreeItem[] = [
  matchingStream,
  {
    name: "Borussia Mönchengladbach vs Hamburg SV",
    category: "soccer",
    league: "Bundesliga",
    stream_key: "bmg-hsv",
    match_timestamp: Date.parse("2026-11-06T19:30:00Z") / 1000,
    sources: [{ quality: "HD", url: "https://strmfree.st/embed/bmg", live: true }],
  },
]

const matchedMap = matchFixtures(fixtures, streams)
assert.equal(matchedMap.size, 2, "Should match 2 out of 3 fixtures")
assert.ok(matchedMap.has(101))
assert.ok(matchedMap.has(102))
assert.ok(!matchedMap.has(103), "Arsenal vs Chelsea has no stream and should not match")

console.log("streamfree matcher: all assertions passed")

