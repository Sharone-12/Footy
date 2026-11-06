import assert from "node:assert/strict"
import { matchFixtureToDamiTv, matchFixturesToDamiTv } from "./matcher"
import type { DamiTvParsedStream } from "./types"
import type { Fixture } from "@/lib/providers/types"

async function runTests() {
  const streams: DamiTvParsedStream[] = [
    {
      id: "mm-au-aus1-401892147",
      name: "Macarthur FC vs Western Sydney Wanderers FC",
      home: "Macarthur FC",
      away: "Western Sydney Wanderers FC",
      league: "A-League Men",
      status: "LIVE",
      isLive: true,
      startsAt: 1793436000,
      endsAt: 1793446800,
      kickoffIso: new Date(1793436000 * 1000).toISOString(),
      embedUrl: "https://damitv.st/embed/?id=mm-au-aus1-401892147",
      sources: [
        {
          id: "dm1",
          name: "TNT Sports 3 UK",
          sd: 0,
          hd: 1,
          embed: "https://damitv.st/player/hls/?v=542&url=...",
        },
        {
          id: "dm2",
          name: "Sky Sport 3 NZ",
          sd: 0,
          hd: 1,
          embed: "https://damitv.st/player/hls/?v=543&url=...",
        },
      ],
    },
    {
      id: "es-laliga-barca-atleti",
      name: "FC Barcelona vs Atletico Madrid",
      home: "FC Barcelona",
      away: "Atletico Madrid",
      league: "La Liga",
      status: "UPCOMING",
      isLive: false,
      startsAt: 1794100000,
      endsAt: 1794110000,
      kickoffIso: new Date(1794100000 * 1000).toISOString(),
      embedUrl: "https://damitv.st/embed/?id=es-laliga-barca-atleti",
      sources: [
        {
          id: "dm-la1",
          name: "DAZN LaLiga",
          sd: 0,
          hd: 1,
          embed: "https://damitv.st/player/hls/?v=601",
        },
      ],
    },
  ]

  // Test 1: High confidence match with team alias (Barca / Barcelona)
  const fixture1: Fixture = {
    event_id: 201,
    home: "FC Barcelona",
    away: "Atlético Madrid",
    league: "La Liga",
    date: "2026-11-08",
    kickoff: new Date(1794100000 * 1000).toISOString(),
  }

  const match1 = matchFixtureToDamiTv(fixture1, streams)
  assert.ok(match1, "Should associate Barcelona vs Atletico Madrid")
  assert.equal(match1.stream.id, "es-laliga-barca-atleti")
  assert.ok(match1.confidence >= 85, "Confidence should be >= 85")
  assert.equal(match1.isConfirmedMatch, true)

  // Test 2: Match with multiple sources preserved
  const fixture2: Fixture = {
    event_id: 202,
    home: "Macarthur FC",
    away: "Western Sydney Wanderers FC",
    league: "A-League Men",
    date: "2026-11-08",
    kickoff: new Date(1793436000 * 1000).toISOString(),
  }

  const match2 = matchFixtureToDamiTv(fixture2, streams)
  assert.ok(match2, "Should associate Macarthur vs Western Sydney")
  assert.equal(match2.stream.id, "mm-au-aus1-401892147")
  assert.equal(match2.stream.sources.length, 2, "Both sources should be preserved")

  // Test 3: Reject single team match (e.g. Barcelona vs Real Madrid should NOT match Barcelona vs Atletico)
  const fixtureSingleTeam: Fixture = {
    event_id: 203,
    home: "FC Barcelona",
    away: "Real Madrid",
    league: "La Liga",
    date: "2026-11-08",
    kickoff: new Date(1794100000 * 1000).toISOString(),
  }

  const matchSingle = matchFixtureToDamiTv(fixtureSingleTeam, streams)
  assert.equal(
    matchSingle,
    null,
    "Strict rule: Single-team match MUST be rejected",
  )

  // Test 4: Batch matching
  const batch = matchFixturesToDamiTv([fixture1, fixture2, fixtureSingleTeam], streams)
  assert.equal(batch.size, 2, "Should match exactly the 2 valid fixtures")
  assert.equal(batch.get(201)?.stream.id, "es-laliga-barca-atleti")
  assert.equal(batch.get(202)?.stream.id, "mm-au-aus1-401892147")

  console.log("damitv matcher: all assertions passed")
}

runTests().catch((err) => {
  console.error("damitv matcher test failed:", err)
  process.exit(1)
})
