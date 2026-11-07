import { NextResponse } from "next/server"
import { fetchLiveScores, type LiveScore } from "@/lib/livescores"

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

type Snapshot = { at: number; scores: LiveScore[] }
let cached: Snapshot | null = null
let inflight: Promise<Snapshot> | null = null

async function load(): Promise<Snapshot> {
  // One upstream request per window even under concurrent requests: without
  // this, a burst of clients on a cold cache each start their own fetch.
  if (inflight) return inflight
  inflight = (async () => {
    try {
      const scores = await fetchLiveScores()
      cached = { at: Date.now(), scores }
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

  return NextResponse.json(
    { at: snapshot!.at, scores: snapshot!.scores },
    { headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=60" } },
  )
}
