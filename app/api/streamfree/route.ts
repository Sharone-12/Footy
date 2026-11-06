import { NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"
import type { Fixture } from "@/lib/providers/types"
import {
  fetchSoccerStreams,
  fetchSingleStream,
  fetchStreamSources,
} from "@/lib/streamfree/client"
import {
  matchFixtureToStream,
  matchFixtures,
} from "@/lib/streamfree/matcher"

/**
 * Backend API layer for StreamFree.
 *
 * Supported query params:
 *   - ?fixture_id=12345        -> Returns matched stream for a specific fixture
 *   - ?stream_key=abc          -> Returns single stream details
 *   - ?stream_key=abc&sources=1 -> Returns source-only updates
 *   - (none)                   -> Returns matched streams for current upcoming/live fixtures
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const fixtureIdRaw = searchParams.get("fixture_id")
    const streamKey = searchParams.get("stream_key")
    const sourcesOnly = searchParams.get("sources") === "1" || searchParams.get("sources_only") === "true"

    // 1. Single stream sources update
    if (streamKey && sourcesOnly) {
      const sources = await fetchStreamSources(streamKey)
      return NextResponse.json(
        { stream_key: streamKey, sources },
        {
          headers: {
            "Cache-Control": "public, s-maxage=30, stale-while-revalidate=15",
          },
        },
      )
    }

    // 2. Single stream full details
    if (streamKey) {
      const stream = await fetchSingleStream(streamKey)
      if (!stream) {
        return NextResponse.json({ error: "Stream not found" }, { status: 404 })
      }
      return NextResponse.json(
        { stream },
        {
          headers: {
            "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30",
          },
        },
      )
    }

    // 3. Matched stream for a single fixture ID
    if (fixtureIdRaw) {
      const eventId = Number(fixtureIdRaw)
      if (!Number.isSafeInteger(eventId) || eventId <= 0) {
        return NextResponse.json({ error: "Invalid fixture_id" }, { status: 400 })
      }

      const { data: fixtureRow, error } = await supabase
        .from("matches")
        .select("event_id, home, away, league, kickoff, date")
        .eq("event_id", eventId)
        .maybeSingle()

      if (error) {
        console.error(`[streamfree] Supabase lookup error for fixture ${eventId}:`, error.message)
        return NextResponse.json({ error: "Fixture lookup failed" }, { status: 502 })
      }

      if (!fixtureRow) {
        return NextResponse.json({ error: "Fixture not found" }, { status: 404 })
      }

      const streams = await fetchSoccerStreams()
      const matched = matchFixtureToStream(fixtureRow as Fixture, streams)

      return NextResponse.json(
        {
          event_id: eventId,
          matched: Boolean(matched),
          stream: matched,
        },
        {
          headers: {
            "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30",
          },
        },
      )
    }

    // 4. Batch directory matches for live & upcoming fixtures
    const streams = await fetchSoccerStreams()

    // Fetch upcoming fixtures from database (yesterday through next 7 days)
    const from = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
    const to = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)

    const { data: fixtures, error } = await supabase
      .from("matches")
      .select("event_id, home, away, league, kickoff, date")
      .eq("status", "upcoming")
      .gte("date", from)
      .lte("date", to)
      .order("date", { ascending: true })
      .limit(60)

    if (error) {
      console.error("[streamfree] Fixtures query error:", error.message)
      return NextResponse.json({ error: "Database error" }, { status: 502 })
    }

    const matchedMap = matchFixtures((fixtures || []) as Fixture[], streams)
    const matchedList: Array<{ event_id: number } & ReturnType<typeof matchFixtureToStream>> = []

    for (const [eventId, matched] of matchedMap.entries()) {
      if (matched) {
        matchedList.push({ event_id: eventId, ...matched })
      }
    }

    return NextResponse.json(
      {
        count: matchedList.length,
        streams: matchedList,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30",
        },
      },
    )
  } catch (err: unknown) {
    if (
      err &&
      typeof err === "object" &&
      "digest" in err &&
      typeof (err as { digest: unknown }).digest === "string" &&
      ((err as { digest: string }).digest.startsWith("NEXT_") ||
        (err as { digest: string }).digest === "DYNAMIC_SERVER_USAGE")
    ) {
      throw err
    }
    console.error("[streamfree] API route error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
