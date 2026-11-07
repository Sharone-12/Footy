/**
 * Unit tests for Cinevid client, event parsing, football filtering, and URL normalization.
 * Run with: npx tsx lib/cinevid/client.test.ts
 */

import assert from "node:assert/strict"
import {
  resolveCinevidUrl,
  isFootballSport,
  normalizeCinevidStatus,
  parseCinevidTeams,
  normalizeCinevidEvent,
  CINEVID_BASE_URL,
} from "./client.ts"
import type { CinevidRawEvent } from "./types.ts"

async function runTests() {
  console.log("Running Cinevid client unit tests...")

  // 1. URL Normalization
  assert.equal(
    resolveCinevidUrl("/embed/live/064505804/example"),
    "https://cinevid.st/embed/live/064505804/example",
    "Relative embed URL should resolve against CINEVID_BASE_URL",
  )
  assert.equal(
    resolveCinevidUrl("/api/public/img/badge123"),
    "https://cinevid.st/api/public/img/badge123",
    "Relative image URL should resolve against CINEVID_BASE_URL",
  )
  assert.equal(
    resolveCinevidUrl("https://cinevid.st/embed/live/12345"),
    "https://cinevid.st/embed/live/12345",
    "Absolute cinevid.st URL should be preserved",
  )
  assert.equal(
    resolveCinevidUrl("http://cinevid.st/embed/live/12345"),
    "http://cinevid.st/embed/live/12345",
    "HTTP cinevid.st URL should be supported",
  )
  // Untrusted external origin rejection
  assert.equal(
    resolveCinevidUrl("https://malicious-site.com/embed"),
    null,
    "External untrusted origins must be rejected",
  )
  // XSS / Malicious protocols rejection
  assert.equal(
    resolveCinevidUrl("javascript:alert(1)"),
    null,
    "javascript: scheme must be rejected",
  )
  assert.equal(
    resolveCinevidUrl("data:text/html,<script>"),
    null,
    "data: scheme must be rejected",
  )
  assert.equal(resolveCinevidUrl(null), null)
  assert.equal(resolveCinevidUrl(""), null)

  // 2. Football Sport Category Filtering
  assert.equal(isFootballSport("Football"), true)
  assert.equal(isFootballSport("football"), true)
  assert.equal(isFootballSport("Soccer"), true)
  assert.equal(isFootballSport("SOCCER"), true)
  // Strict non-football rejection
  assert.equal(isFootballSport("Basketball"), false, "Basketball must be rejected")
  assert.equal(isFootballSport("American Football"), false, "American Football (NFL) must be rejected")
  assert.equal(isFootballSport("Baseball"), false, "Baseball must be rejected")
  assert.equal(isFootballSport("Rugby"), false, "Rugby must be rejected")
  assert.equal(isFootballSport("Cricket"), false, "Cricket must be rejected")
  assert.equal(isFootballSport("Ice Hockey"), false, "Ice Hockey must be rejected")
  assert.equal(isFootballSport(null), false)

  // 3. Status Normalization
  assert.equal(normalizeCinevidStatus("NS"), "UPCOMING")
  assert.equal(normalizeCinevidStatus("Live"), "LIVE")
  assert.equal(normalizeCinevidStatus("live"), "LIVE")
  assert.equal(normalizeCinevidStatus("Finished"), "FINISHED")
  assert.equal(normalizeCinevidStatus("Ended"), "FINISHED")
  assert.equal(normalizeCinevidStatus("Unknown"), "UPCOMING")
  assert.equal(normalizeCinevidStatus(null), "UPCOMING")

  // 4. Team Parsing from Title
  assert.deepEqual(parseCinevidTeams("St Mirren vs Rangers"), {
    home: "St Mirren",
    away: "Rangers",
  })
  assert.deepEqual(parseCinevidTeams("Real Madrid v Barcelona"), {
    home: "Real Madrid",
    away: "Barcelona",
  })
  assert.deepEqual(parseCinevidTeams("Arsenal - Chelsea"), {
    home: "Arsenal",
    away: "Chelsea",
  })

  // 5. Complete Event Normalization
  const rawFootball: CinevidRawEvent = {
    id: "002993891",
    slug: "st-mirren-vs-rangers",
    title: "St Mirren vs Rangers",
    sport: "Football",
    league: "Scottish Premier League",
    date: "2026-11-07",
    time: "20:00",
    status: "Live",
    score: "1 : 0",
    round: "Round 13",
    venue: "St Mirren Park",
    homeTeamImage: "/api/public/img/st-mirren",
    awayTeamImage: "/api/public/img/rangers",
    thumbnail: "/api/public/img/thumb",
    playerUrl: "/embed/live/002993891",
  }

  const normalized = normalizeCinevidEvent(rawFootball)
  assert.ok(normalized, "Football event should be normalized")
  assert.equal(normalized.id, "002993891", "Event ID must be string")
  assert.equal(normalized.home, "St Mirren")
  assert.equal(normalized.away, "Rangers")
  assert.equal(normalized.status, "LIVE")
  assert.equal(normalized.isLive, true)
  assert.equal(normalized.playerUrl, "https://cinevid.st/embed/live/002993891")
  assert.equal(normalized.homeTeamImage, "https://cinevid.st/api/public/img/st-mirren")
  assert.equal(normalized.kickoffIso, "2026-11-07T20:00:00.000Z", "UTC date and time parsed to ISO")
  assert.equal(normalized.kickoffTimestampMs, new Date("2026-11-07T20:00:00.000Z").getTime())

  // 6. Rejection of Non-Football in Event Normalization
  const rawBasketball: CinevidRawEvent = {
    id: "001436608",
    slug: "indiana-pacers-vs-denver-nuggets",
    title: "Indiana Pacers vs Denver Nuggets",
    sport: "Basketball",
    league: "NBA",
    date: "2026-11-07",
    time: "22:00",
    status: "NS",
    score: null,
    round: null,
    venue: null,
    homeTeamImage: null,
    awayTeamImage: null,
    thumbnail: null,
    playerUrl: "/embed/live/001436608",
  }
  assert.equal(normalizeCinevidEvent(rawBasketball), null, "Basketball event must be filtered out")

  // 7. Rejection of Event Without Valid Player URL
  const rawMissingPlayer: CinevidRawEvent = {
    ...rawFootball,
    playerUrl: null,
  }
  assert.equal(normalizeCinevidEvent(rawMissingPlayer), null, "Event with null playerUrl must be rejected")

  console.log("Cinevid client tests passed cleanly!")
}

runTests().catch((err) => {
  console.error("Cinevid client test failed:", err)
  process.exit(1)
})

