import assert from "node:assert/strict"
import {
  parseMatchoraChannel,
  normalizeMatchoraEvent,
  isFootballMatch,
} from "./client.ts"
import type { MatchoraRawEvent } from "./types.ts"

async function runTests() {
  console.log("Running Matchora client unit tests...")

  // 1. Football filtering
  const soccerEvent: MatchoraRawEvent = {
    id: "2506279",
    home: "Atlético Madrid",
    away: "Barcelona",
    league: "Spanish La Liga",
    sport: "Soccer",
    kickoff: 1794168000,
    embed_url: "https://es.matchora.pro/embed/match/2506279",
  }
  assert.equal(isFootballMatch(soccerEvent), true, "Soccer match should be identified as football")

  const basketballEvent: MatchoraRawEvent = {
    id: "2571782",
    home: "FC Barcelona Basquet",
    away: "CB Breogan",
    league: "Spanish Liga ACB",
    sport: "Basketball",
    kickoff: 1794135600,
    embed_url: "https://es.matchora.pro/embed/match/2571782",
  }
  assert.equal(isFootballMatch(basketballEvent), false, "Basketball match must be rejected")

  const americanFootball: MatchoraRawEvent = {
    id: "999",
    home: "Patriots",
    away: "Chiefs",
    league: "NFL",
    sport: "American Football",
    kickoff: 1794135600,
    embed_url: "https://matchora.pro/embed/match/999",
  }
  assert.equal(isFootballMatch(americanFootball), false, "American football must be rejected")

  // 2. Normalization
  const parsed = normalizeMatchoraEvent(soccerEvent)
  assert.equal(parsed.id, "2506279")
  assert.equal(parsed.home, "Atlético Madrid")
  assert.equal(parsed.away, "Barcelona")
  assert.equal(parsed.status, "upcoming")
  assert.equal(parsed.embedUrl, "https://es.matchora.pro/embed/match/2506279")
  assert.equal(parsed.dateIso, "2026-11-08")

  // 3. Channel parsing
  const ch = parseMatchoraChannel({
    id: "118458",
    name: "DAZN 2",
    country: "🇵🇹",
    quality: "HD",
    lang: "Portuguese",
    embed_url: "https://es.matchora.pro/embed/channel/118458",
  })
  assert.equal(ch.id, "118458")
  assert.equal(ch.name, "DAZN 2")
  assert.equal(ch.embedUrl, "https://es.matchora.pro/embed/channel/118458")

  console.log("✅ All Matchora client unit tests passed!")
}

runTests().catch((err) => {
  console.error("Matchora client test failed:", err)
  process.exit(1)
})

