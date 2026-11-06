import { NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"
import type { Fixture } from "@/lib/providers/types"
import { requireLiveAuth } from "@/lib/live/auth"
import { fetchDaddyLiveSchedule } from "@/lib/daddylive/client"
import { matchFixtureToDaddyLive, matchFixturesToDaddyLive } from "@/lib/daddylive/matcher"

/**
 * Backend API layer for DaddyLiveHD stream matching.
 *
 * Supported query params:
 *   - ?fixture_id=12345        -> Returns matched DaddyLive streams for a specific fixture
 *   - (none)                   -> Returns matched streams for upcoming fixtures
 */
export async function GET(request: Request) {
  const authError = requireLiveAuth(request)
  if (authError) return authError

  try {
    const { searchParams } = new URL(request.url)
    const fixtureIdRaw = searchParams.get("fixture_id")

    // 1. Single fixture match
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

      const schedule = await fetchDaddyLiveSchedule()
      const matched = matchFixtureToDaddyLive(fixtureRow as Fixture, schedule)

      if (!matched) {
        return NextResponse.json(
          { matched: false, streams: null },
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

    // 2. Batch fixtures matching
    const schedule = await fetchDaddyLiveSchedule()
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
      console.error("[daddylive] Fixtures query error:", error.message)
      return NextResponse.json({ error: "Database error" }, { status: 502 })
    }

    const matchedMap = matchFixturesToDaddyLive((fixtures || []) as Fixture[], schedule)
    const matchedList: Array<{ event_id: number } & ReturnType<typeof matchFixtureToDaddyLive>> = []

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
    console.error("[daddylive] API route error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

