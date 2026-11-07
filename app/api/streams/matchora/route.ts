import { NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"
import type { Fixture } from "@/lib/providers/types"
import { requireLiveAuth } from "@/lib/live/auth"
import { fetchMatchoraSchedule } from "@/lib/matchora/client"
import { matchFixtureToMatchora, matchFixturesToMatchora } from "@/lib/matchora/matcher"

/**
 * Backend API layer for Matchora stream matching.
 *
 * Supported query params:
 *   - ?fixture_id=12345        -> Returns matched Matchora event for a specific fixture
 *   - (none)                   -> Returns matched streams for upcoming/live fixtures
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

      const events = await fetchMatchoraSchedule({ date: fixtureRow.date })
      const matched = matchFixtureToMatchora(fixtureRow as Fixture, events)

      if (!matched) {
        return NextResponse.json(
          { matched: false, stream: null },
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

    // 2. Batch fixtures matching (upcoming and active window)
    const now = new Date()
    const today = now.toISOString().slice(0, 10)
    const tomorrow = new Date(now.getTime() + 86_400_000).toISOString().slice(0, 10)
    const yesterday = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10)
    const nextWeek = new Date(now.getTime() + 7 * 86_400_000).toISOString().slice(0, 10)

    // Fetch schedules for today, tomorrow, and general watchable
    const [eventsToday, eventsTomorrow] = await Promise.all([
      fetchMatchoraSchedule({ date: today }).catch(() => []),
      fetchMatchoraSchedule({ date: tomorrow }).catch(() => []),
    ])

    const allEventsMap = new Map<string, (typeof eventsToday)[0]>()
    for (const ev of [...eventsToday, ...eventsTomorrow]) {
      allEventsMap.set(ev.id, ev)
    }
    const events = Array.from(allEventsMap.values())

    const { data: fixtures, error } = await supabase
      .from("matches")
      .select("event_id, date, kickoff, league, home, home_id, away, away_id")
      .gte("date", yesterday)
      .lte("date", nextWeek)
      .order("date", { ascending: true })

    if (error) {
      console.error("[matchora] Fixtures query error:", error.message)
      return NextResponse.json({ error: "Database error" }, { status: 502 })
    }

    const matchedMap = matchFixturesToMatchora((fixtures || []) as Fixture[], events)
    const matchedList: Array<{ event_id: number } & ReturnType<typeof matchFixtureToMatchora>> = []

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
    console.error("[matchora] API handler error:", err)
    return NextResponse.json({ error: "Failed to process Matchora stream request" }, { status: 500 })
  }
}

