import assert from "node:assert/strict"
import {
  resolveScheduleDate,
  resolveUkTime,
  parseEventTeams,
  fetchDaddyLiveChannels,
  fetchDaddyLiveSchedule,
  _clearDaddyLiveCache,
} from "./client.ts"
import { getDaddyLivePlayerUrl, normalizeDaddyLiveLogo } from "./urls.ts"

async function runTests() {
  _clearDaddyLiveCache()

  // 1. URL generator
  assert.equal(
    getDaddyLivePlayerUrl("302"),
    "https://thedaddy.li/stream/stream-302.php",
    "Default player URL",
  )
  assert.equal(
    getDaddyLivePlayerUrl("stream-302.php"),
    "https://thedaddy.li/stream/stream-302.php",
    "Should strip prefix/suffix",
  )
  assert.equal(
    getDaddyLivePlayerUrl("491", "cast"),
    "https://thedaddy.li/cast/stream-491.php",
    "Cast folder URL",
  )

  // 2. Logo URL normalization
  assert.equal(
    normalizeDaddyLiveLogo("logos/bein_sports_1.png"),
    "https://thedaddy.li/logos/bein_sports_1.png",
    "Should convert relative path",
  )
  assert.equal(
    normalizeDaddyLiveLogo("/logos/sky_sports.png"),
    "https://thedaddy.li/logos/sky_sports.png",
    "Should handle leading slash",
  )
  assert.equal(
    normalizeDaddyLiveLogo("https://example.com/logo.png"),
    "https://example.com/logo.png",
    "Should preserve absolute URLs",
  )
  assert.equal(normalizeDaddyLiveLogo(null), undefined, "Should handle null")

  // 3. Dynamic schedule date parsing
  const base = new Date("2026-11-06T12:00:00Z")
  assert.equal(resolveScheduleDate("Today", base), "2026-11-06")
  assert.equal(resolveScheduleDate("Tomorrow", base), "2026-11-07")
  assert.equal(resolveScheduleDate("Yesterday", base), "2026-11-05")
  assert.equal(resolveScheduleDate("2026-11-10", base), "2026-11-10")

  // 4. UK Timezone conversion
  const utcKickoff = resolveUkTime("2026-11-06", "19:30")
  assert.equal(utcKickoff, "2026-11-06T19:30:00.000Z")

  // 5. Team parsing
  const parsed1 = parseEventTeams("Barcelona vs Real Madrid")
  assert.equal(parsed1.home, "Barcelona")
  assert.equal(parsed1.away, "Real Madrid")

  const parsed2 = parseEventTeams("Arsenal - Chelsea")
  assert.equal(parsed2.home, "Arsenal")
  assert.equal(parsed2.away, "Chelsea")

  const parsed3 = parseEventTeams("Liverpool v Manchester City")
  assert.equal(parsed3.home, "Liverpool")
  assert.equal(parsed3.away, "Manchester City")

  // 6. Missing API key handling (graceful fallback)
  const channels = await fetchDaddyLiveChannels()
  assert.ok(Array.isArray(channels), "Should return array without throwing when unauthenticated")

  const schedule = await fetchDaddyLiveSchedule()
  assert.ok(Array.isArray(schedule), "Should return array without throwing when unauthenticated")

  console.log("daddylive client: all assertions passed")
}

runTests().catch((err) => {
  console.error("daddylive client test failed:", err)
  process.exit(1)
})

