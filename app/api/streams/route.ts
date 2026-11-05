import { NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"
import { discover } from "@/lib/providers/discover"
import type { Fixture } from "@/lib/providers/types"

/**
 * Provider discovery for one fixture.
 *
 *   GET /api/streams?event_id=16421101
 *
 * This route is the dedupe and cache boundary: the kickoff timer's
 * pre-kickoff fetch, the stream page's own render and a second open tab all
 * collapse into a single provider fan-out. See lib/providers/discover.ts.
 *
 * Credentials stay on this side — the response carries only public event page
 * URLs. `revalidate` is rejected under nextConfig.cacheComponents, so
 * freshness comes from the header.
 */
export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("event_id")
  const eventId = Number(raw)
  if (!raw || !Number.isSafeInteger(eventId) || eventId <= 0) {
    return NextResponse.json({ error: "event_id must be a positive integer" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("matches")
    .select("event_id, home, away, league, kickoff, date")
    .eq("event_id", eventId)
    .maybeSingle()

  if (error) {
    console.error(`[providers] fixture lookup failed for ${eventId}: ${error.message}`)
    return NextResponse.json({ error: "fixture lookup failed" }, { status: 502 })
  }
  if (!data) return NextResponse.json({ error: "unknown fixture" }, { status: 404 })

  const result = await discover(data as Fixture)

  return NextResponse.json(result, {
    headers: {
      // Matches the orchestrator's in-process TTL; a stale copy for a few
      // seconds either side of kickoff is better than a repeat fan-out.
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30",
    },
  })
}
