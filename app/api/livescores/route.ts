import { NextResponse, after } from "next/server"
import { fetchDaySnapshot, type LiveScore } from "@/lib/livescores"
import { settleFinished } from "@/lib/live/settle"

/**
 * In-play scores, fetched upstream once per window and shared by every client.
 *
 * The upstream payload is the whole day's fixtures — ~420 KB raw, ~80 KB
 * gzipped — to yield roughly thirty in-play rows, so it must not be fetched
 * per request. The cache below is module-scope rather than `revalidate`,
 * which `nextConfig.cacheComponents` rejects (same reason as the players
 * route); freshness is published through Cache-Control.
 */

/** Long enough to keep upstream load flat, short enough that a goal lands fast. */
const TTL_MS = 15_000

/** How long a stale snapshot may still be served when upstream is failing. */
const GRACE_MS = 5 * 60_000

/**
 * How often full time is written through to the database.
 *
 * The scoreboard polls every 15s, but a result only needs recording once —
 * and the settle pass costs a query whether or not anything has finished.
 */
const SETTLE_EVERY_MS = 60_000
let lastSettle = 0

type Snapshot = { at: number; scores: LiveScore[]; final: LiveScore[] }
let cached: Snapshot | null = null
let inflight: Promise<Snapshot> | null = null

async function load(): Promise<Snapshot> {
  // One upstream request per window even under concurrent requests: without
  // this, a burst of clients on a cold cache each start their own fetch.
  if (inflight) return inflight
  inflight = (async () => {
    try {
      const { live, final } = await fetchDaySnapshot()
      cached = { at: Date.now(), scores: live, final }
      return cached
    } finally {
      inflight = null
    }
  })()
  return inflight
}

export async function GET() {
  let snapshot = cached
  const fresh = snapshot && Date.now() - snapshot.at < TTL_MS

  if (!fresh) {
    try {
      snapshot = await load()
    } catch (error) {
      // A blank scoreboard is worse than a slightly old one, so a recent
      // snapshot keeps serving while upstream is down.
      if (!snapshot || Date.now() - snapshot.at > GRACE_MS) {
        return NextResponse.json(
          { error: error instanceof Error ? error.message : "live feed unavailable" },
          { status: 503, headers: { "Cache-Control": "no-store" } },
        )
      }
    }
  }

  // Record any full-time results behind the response. The scraper still
  // fetches every scoreline on its own schedule and overwrites whatever lands
  // here; this only stops a result waiting hours for the next run.
  const finished = snapshot!.final
  if (finished.length > 0 && Date.now() - lastSettle > SETTLE_EVERY_MS) {
    lastSettle = Date.now()
    after(async () => {
      try {
        await settleFinished(finished)
      } catch {
        // Never let bookkeeping break the scoreboard; the scraper is the
        // backstop either way.
      }
    })
  }

  return NextResponse.json(
    { at: snapshot!.at, scores: snapshot!.scores, final: snapshot!.final },
    { headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=60" } },
  )
}
