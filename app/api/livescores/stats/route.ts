import { NextResponse } from "next/server"
import { resolveLiveScoreEvent } from "@/lib/livescores-resolver"
import {
  fetchStatsForEid,
  type LiveMatchStatsResponse,
  type LiveMatchStatsTeam,
} from "@/lib/livescores-stats"

export type { LiveMatchStatsResponse, LiveMatchStatsTeam }

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const eidParam = searchParams.get("eid")
  const fixtureIdParam = searchParams.get("fixture_id")

  // Stats need only the eid. Resolving via fixture_id costs a Supabase round
  // trip plus a walk over the day feed, so it is only done when the client
  // has nothing better; the live cards and watch page already hold the eid.
  const eid = eidParam?.trim() || (await resolveLiveScoreEvent(null, fixtureIdParam))?.eid
  if (!eid) {
    return NextResponse.json(
      { error: "Missing eid or active live match" },
      { status: 400, headers: { "Cache-Control": "public, s-maxage=30" } },
    )
  }

  const stats = await fetchStatsForEid(eid)

  // Every live card and the watch page poll this at 15s, so the CDN must
  // absorb those polls: same window as the in-memory TTL above.
  return NextResponse.json(stats, {
    headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=30" },
  })
}

