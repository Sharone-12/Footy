import { NextResponse } from "next/server"
import { getLiveStreams } from "@/lib/streaming/live-streams"

/**
 * Which fixtures have a stream right now: the ids only, for the badge on
 * fixture rows anywhere on the site. The full per-provider lists live at
 * /api/streams/live; both come from the same cached fan-out.
 */
export async function GET() {
  const { active, at } = await getLiveStreams()
  return NextResponse.json(
    { eventIds: active, timestamp: at },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=180" } },
  )
}
