import { NextResponse } from "next/server"
import { requireLiveAuth } from "@/lib/live/auth"
import { getLiveStreams } from "@/lib/streaming/live-streams"

/**
 * Every provider's matches for the live window in one response, for the
 * /live page's provider pills. Replaces seven per-provider batch calls.
 */
export async function GET(request: Request) {
  const authError = requireLiveAuth(request)
  if (authError) return authError

  const streams = await getLiveStreams()
  return NextResponse.json(streams, {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
  })
}
