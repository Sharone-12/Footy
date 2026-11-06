import assert from "node:assert/strict"
import { matchFixtureToDaddyLive, matchFixturesToDaddyLive } from "./matcher"
import type { DaddyLiveParsedEvent } from "./types"
import type { Fixture } from "@/lib/providers/types"

async function runTests() {
  const events: DaddyLiveParsedEvent[] = [
    {
      id: "ev-1",
      rawTitle: "Barcelona vs Atletico Madrid",
      home: "Barcelona",
      away: "Atletico Madrid",
      timeStr: "20:00",
      kickoffIso: "2026-11-08T20:00:00.000Z",
      channels: [
        {
          channel_id: "302",
          channel_name: "beIN SPORTS 1",
          player_url: "https://thedaddy.li/stream/stream-302.php",
        },
        {
          channel_id: "491",
          channel_name: "SuperSport LaLiga",
          player_url: "https://thedaddy.li/stream/stream-491.php",
        },
      ],
    },
    {
      id: "ev-2",
      rawTitle: "Arsenal vs Chelsea",
      home: "Arsenal",
      away: "Chelsea",
      timeStr: "16:30",
      kickoffIso: "2026-11-08T16:30:00.000Z",
      channels: [
        {
          channel_id: "501",
          channel_name: "Sky Sports Premier League",
          player_url: "https://thedaddy.li/stream/stream-501.php",
        },
      ],
    },
    {
      id: "ev-3",
      rawTitle: "Real Madrid vs Osasuna",
      home: "Real Madrid",
      away: "Osasuna",
      timeStr: "14:00",
      kickoffIso: "2026-11-08T14:00:00.000Z",
      channels: [
        {
          channel_id: "303",
          channel_name: "DAZN LaLiga",
          player_url: "https://thedaddy.li/stream/stream-303.php",
        },
      ],
    },
  ]

  // Test 1: Exact match with alias (FC Barcelona vs Atletico Madrid)
  const fixture1: Fixture = {
    event_id: 101,
    home: "FC Barcelona",
    away: "Atlético Madrid",
    league: "La Liga",
    date: "2026-11-08",
    kickoff: "2026-11-08T20:00:00Z",
  }

  const match1 = matchFixtureToDaddyLive(fixture1, events)
  assert.ok(match1, "Should associate Barcelona vs Atletico Madrid")
  assert.equal(match1.event.id, "ev-1")
  assert.equal(match1.isConfirmedMatch, true, "Should be confirmed match")
  assert.ok(match1.confidence >= 85, "Confidence should be >= 85")
  assert.equal(match1.channels.length, 2, "Should preserve all channels")

  // Test 2: Both teams match with close kickoff
  const fixture2: Fixture = {
    event_id: 102,
    home: "Arsenal",
    away: "Chelsea",
    league: "Premier League",
    date: "2026-11-08",
    kickoff: "2026-11-08T16:30:00Z",
  }

  const match2 = matchFixtureToDaddyLive(fixture2, events)
  assert.ok(match2, "Should associate Arsenal vs Chelsea")
  assert.equal(match2.event.id, "ev-2")
  assert.ok(match2.confidence >= 85)

  // Test 3: Reject match when ONLY one team matches (e.g. Barcelona vs Mallorca should NOT match ev-1)
  const fixtureSingleTeam: Fixture = {
    event_id: 103,
    home: "FC Barcelona",
    away: "RCD Mallorca",
    league: "La Liga",
    date: "2026-11-08",
    kickoff: "2026-11-08T20:00:00Z",
  }

  const matchSingle = matchFixtureToDaddyLive(fixtureSingleTeam, events)
  assert.equal(
    matchSingle,
    null,
    "Strict rule: Single-team match MUST be rejected (never associate wrong opponent)",
  )

  // Test 4: Reject match when kickoff is far apart (> 6 hours)
  const fixtureWrongDate: Fixture = {
    event_id: 104,
    home: "Real Madrid",
    away: "Osasuna",
    league: "La Liga",
    date: "2026-11-12",
    kickoff: "2026-11-12T14:00:00Z",
  }

  const matchWrongDate = matchFixtureToDaddyLive(fixtureWrongDate, events)
  assert.equal(matchWrongDate, null, "Should reject match when date does not align")

  // Test 5: Batch fixtures matching
  const batch = matchFixturesToDaddyLive([fixture1, fixture2, fixtureSingleTeam], events)
  assert.equal(batch.size, 2, "Should only match the 2 valid fixtures")
  assert.equal(batch.get(101)?.event.id, "ev-1")
  assert.equal(batch.get(102)?.event.id, "ev-2")

  console.log("daddylive matcher: all assertions passed")
}

runTests().catch((err) => {
  console.error("daddylive matcher test failed:", err)
  process.exit(1)
})

