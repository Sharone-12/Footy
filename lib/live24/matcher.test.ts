import assert from "node:assert/strict"
import { normalizeLive24Event } from "./client.ts"
import { matchFixtureToLive24, cleanTeamName, matchTeamNames } from "./matcher.ts"
import type { Live24EventItem } from "./types.ts"

console.log("Running Live24 matcher unit tests...")

// Test 1: Team cleaning
assert.equal(cleanTeamName("Eyupspor FC"), "eyupspor")
assert.equal(cleanTeamName("Perth Glory FC W"), "perth glory")

// Test 2: Normalization
const sampleItem: Live24EventItem = {
  name: "Eyupspor vs Kocaelispor",
  category: "Football",
  playing: "Turkey Super Lig 10:30",
  date: "Saturday, Nov 7 2026",
  time: "10:30",
  timestamp: 1794047400,
  streams: [
    { name: "Stream 1", url: "https://livelive24.st/live24.html?url=eyupspor-vs-kocaelispor-stream-1" },
    { name: "Stream 2", url: "https://livelive24.st/live24.html?url=eyupspor-vs-kocaelispor-stream-2" },
  ],
  match_key: "eyupspor vs kocaelispor",
}

const norm = normalizeLive24Event(sampleItem, 0)
assert(norm !== null, "Normalized event should not be null")
assert.equal(norm.homeTeam, "Eyupspor")
assert.equal(norm.awayTeam, "Kocaelispor")
assert.equal(norm.streams.length, 2)
assert.equal(norm.primaryStreamUrl, "https://livelive24.st/live24.html?url=eyupspor-vs-kocaelispor-stream-1")

// Test 3: Fixture match
const fixture = {
  event_id: 991234,
  home: "Eyüpspor",
  away: "Kocaelispor",
  league: "Super Lig",
  date: "2026-11-07",
  kickoff: "10:30",
}

const matched = matchFixtureToLive24(fixture as any, [norm])
assert(matched !== null, "Should match Eyupspor vs Kocaelispor")
assert.equal(matched.event_id, 991234)
assert(matched.matchConfidence >= 85, "Confidence should be high")

console.log("All Live24 tests passed successfully! ✅")

