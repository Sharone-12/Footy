import assert from "node:assert/strict"
import { matchFixtureToZLive, matchFixturesToZLive } from "./matcher"
import type { ZLiveChannel } from "./types"
import type { Fixture } from "@/lib/providers/types"

async function runTests() {
  const channels: ZLiveChannel[] = [
    {
      id: "barca-atleti-live",
      name: "FC Barcelona vs Atletico Madrid",
      sport: "football",
      quality: "FHD",
      live: true,
      url: "https://zlive.st/embed/barca-atleti-live",
    },
    {
      id: "sky-sports-football",
      name: "Sky Sports Football",
      sport: "Sports",
      quality: "FHD",
      live: true,
      url: "https://zlive.st/embed/sky-sports-football",
    },
    {
      id: "supersport-premier",
      name: "SuperSport Premier League",
      sport: "Sports",
      quality: "FHD",
      live: true,
      url: "https://zlive.st/embed/supersport-premier",
    },
    {
      id: "f1-ch",
      name: "Sky Sports F1",
      sport: "F1",
      quality: "HD",
      live: true,
      url: "https://zlive.st/embed/f1-ch",
    },
  ]

  // Test 1: Confirmed fixture match when both teams match
  const fixture1: Fixture = {
    event_id: 101,
    home: "FC Barcelona",
    away: "Atletico Madrid",
    league: "La Liga",
    date: "2026-11-08",
    kickoff: "2026-11-08T20:00:00Z",
  }

  const match1 = matchFixtureToZLive(fixture1, channels)
  assert.ok(match1, "Should match Barcelona vs Atletico Madrid")
  assert.equal(match1.channel.id, "barca-atleti-live")
  assert.ok(match1.isConfirmedMatch, "Should be confirmed match")
  assert.ok(match1.confidence >= 0.75, "Confidence should be >= 0.75")

  // Test 2: Unconfirmed fixtures should NOT match generic channels as match streams
  const fixture2: Fixture = {
    event_id: 102,
    home: "Arsenal",
    away: "Chelsea",
    league: "Premier League",
    date: "2026-11-08",
    kickoff: "2026-11-08T16:30:00Z",
  }

  const match2 = matchFixtureToZLive(fixture2, channels)
  assert.equal(match2, null, "Should not falsely match generic channel when fixture is unconfirmed")

  // Test 3: Generic fallback is disabled for fixtures
  const fixture3: Fixture = {
    event_id: 103,
    home: "Benfica",
    away: "Porto",
    league: "Primeira Liga",
    date: "2026-11-08",
    kickoff: "2026-11-08T18:00:00Z",
  }

  const match3 = matchFixtureToZLive(fixture3, channels)
  assert.equal(match3, null, "Should not falsely match general channel")

  // Test 4: Batch matching
  const batch = matchFixturesToZLive([fixture1, fixture2], channels)
  assert.equal(batch.size, 1)
  assert.equal(batch.get(101)?.channel.id, "barca-atleti-live")

  console.log("zlive matcher: all assertions passed")
}

runTests().catch((err) => {
  console.error("zlive matcher test failed:", err)
  process.exit(1)
})

