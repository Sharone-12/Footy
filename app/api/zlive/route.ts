import { NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"
import type { Fixture } from "@/lib/providers/types"
import { requireLiveAuth } from "@/lib/live/auth"
import { isProviderEnabled } from "@/lib/streaming/config"
import {
  fetchFootballChannels,
  getGenericFootballChannels,
} from "@/lib/zlive/client"
import {
  matchFixtureToZLive,
  matchFixturesToZLive,
} from "@/lib/zlive/matcher"

/**
 * Backend API layer for ZLive.
 *
 * Supported query params:
 *   - ?fixture_id=12345        -> Returns matched channel for a specific fixture
 *   - ?generic=1               -> Returns generic 24/7 football channels
 *   - (none)                   -> Returns matched channels for upcoming fixtures
 */
export async function GET(request: Request) {
  const authError = requireLiveAuth(request)
  if (authError) return authError

  if (!isProviderEnabled("zlive")) {
    return NextResponse.json({
      channels: [],
      genericChannels: [],
      message: "ZLive is disabled via config",
    })
  }

  try {
    const { searchParams } = new URL(request.url)
    const fixtureIdRaw = searchParams.get("fixture_id")
    const genericOnly = searchParams.get("generic") === "1" || searchParams.get("channels") === "generic"

    // 1. Generic channels request
    if (genericOnly) {
      const genericChannels = await getGenericFootballChannels()
      return NextResponse.json(
        {
          count: genericChannels.length,
          channels: genericChannels,
        },
        {
          headers: {
            "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30",
          },
        },
      )
    }

    // 2. Single fixture match
    if (fixtureIdRaw) {
      const eventId = Number(fixtureIdRaw)
      if (Number.isNaN(eventId)) {
        return NextResponse.json({ error: "Invalid fixture_id" }, { status: 400 })
      }

      const { data: fixtureRow, error } = await supabase
        .from("matches")
        .select("event_id, date, kickoff, league, home, home_id, away, away_id")
        .eq("event_id", eventId)
        .single()

      if (error || !fixtureRow) {
        return NextResponse.json({ error: "Fixture not found" }, { status: 404 })
      }

      const channels = await fetchFootballChannels()
      const matched = matchFixtureToZLive(fixtureRow as Fixture, channels)

      if (!matched) {
        return NextResponse.json(
          { matched: false, channel: null },
          {
            headers: {
              "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30",
            },
          },
        )
      }

      return NextResponse.json(
        {
          matched: true,
          ...matched,
        },
        {
          headers: {
            "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30",
          },
        },
      )
    }

    // 3. Batch fixtures matching
    const channels = await fetchFootballChannels()
    const now = new Date()
    const yesterday = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10)
    const nextWeek = new Date(now.getTime() + 7 * 86_400_000).toISOString().slice(0, 10)

    const { data: fixtures, error } = await supabase
      .from("matches")
      .select("event_id, date, kickoff, league, home, home_id, away, away_id")
      .gte("date", yesterday)
      .lte("date", nextWeek)
      .order("date", { ascending: true })

    if (error) {
      console.error("[zlive] Fixtures query error:", error.message)
      return NextResponse.json({ error: "Database error" }, { status: 502 })
    }

    const matchedMap = matchFixturesToZLive((fixtures || []) as Fixture[], channels)
    const matchedList: Array<{ event_id: number } & ReturnType<typeof matchFixtureToZLive>> = []

    for (const [eventId, matched] of matchedMap.entries()) {
      if (matched) {
        matchedList.push({ event_id: eventId, ...matched })
      }
    }

    return NextResponse.json(
      {
        count: matchedList.length,
        channels: matchedList,
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
    console.error("[zlive] API route error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

