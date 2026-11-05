/** Self-check for fixture bucketing: `node lib/live.test.ts` */
import assert from "node:assert/strict"
import { splitFixtures, startOf, PLAYING_MS, SOON_MS } from "./live.ts"

const now = Date.parse("2026-11-08T20:30:00Z")
const at = (iso: string) => ({ kickoff: iso, date: iso.slice(0, 10) })

const rows = [
  at("2026-11-08T20:00:00Z"), // 30 min in — live
  at("2026-11-08T22:00:00Z"), // 90 min away — soon
  at("2026-11-08T18:00:00Z"), // 2.5h ago — past the window, dropped
  at("2026-11-12T20:00:00Z"), // days away — upcoming
  at("2026-11-08T23:30:00Z"), // 3h away exactly — soon, at the boundary
]
const { live, soon, upcoming } = splitFixtures(rows, now)
assert.equal(live.length, 1)
assert.equal(live[0].kickoff, "2026-11-08T20:00:00Z")
assert.equal(soon.length, 2)
assert.equal(upcoming.length, 1)

// Exactly at kickoff is live, not soon; exactly at the far edge is not live.
assert.equal(splitFixtures([at("2026-11-08T20:30:00Z")], now).live.length, 1)
assert.equal(splitFixtures([{ kickoff: new Date(now - PLAYING_MS).toISOString(), date: "x" }], now).live.length, 0)
assert.equal(splitFixtures([{ kickoff: new Date(now + SOON_MS).toISOString(), date: "x" }], now).soon.length, 1)

// A date-only fixture counts from the end of its day, so today's is never
// shown as live just because midnight has passed.
assert.equal(startOf({ kickoff: null, date: "2026-11-08" }), Date.parse("2026-11-08T23:59:59Z"))
assert.equal(splitFixtures([{ kickoff: null, date: "2026-11-08" }], now).live.length, 0)

// Junk never lands in a bucket.
assert.deepEqual(splitFixtures([{ kickoff: "not a date", date: "nope" }], now), {
  live: [],
  soon: [],
  upcoming: [],
})
// Buckets come back in kickoff order.
const ordered = splitFixtures([at("2026-11-20T12:00:00Z"), at("2026-11-14T12:00:00Z")], now)
assert.deepEqual(ordered.upcoming.map((r) => r.kickoff), [
  "2026-11-14T12:00:00Z",
  "2026-11-20T12:00:00Z",
])

console.log("live: all assertions passed")
