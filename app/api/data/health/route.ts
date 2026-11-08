import { NextResponse, connection } from "next/server"
import { supabase } from "@/lib/supabase"

/**
 * Is the data pipeline keeping up?
 *
 * Every failure in this system is silent. The scraper dying, Sofascore
 * blocking us, the laptop staying shut, a query truncating at a row cap —
 * none of them raise anything a visitor would notice, and a stale site looks
 * exactly like a quiet Tuesday with no fixtures. This is the one endpoint
 * that can tell the difference.
 *
 * It measures the outcome rather than the process, deliberately. A timestamp
 * written by refresh.py would only move when refresh.py commits, and it skips
 * committing when nothing changed — so a healthy quiet day would read
 * identically to a dead pipeline. Counting fixtures that ought to have a
 * result and do not cannot lie that way.
 *
 * This is only trustworthy because postponed and cancelled fixtures now carry
 * their own status. While everything that was not finished was written as
 * "upcoming", a postponed match from September sat in this count forever and
 * drowned the signal.
 *
 * Siblings under /api/streams/health cover the stream providers; this one is
 * about the scraper and the database behind them.
 */

/** Kickoff plus this long with no result means we are behind, not mid-match. */
const LATE_AFTER_MS = 12 * 3_600_000

/** Enough to prove there is a problem without hauling back the whole table. */
const SAMPLE = 20

export async function GET() {
  await connection()
  const now = Date.now()
  const cutoff = new Date(now - LATE_AFTER_MS).toISOString()

  const [{ data: stale, error }, { data: recent }] = await Promise.all([
    supabase
      .from("matches")
      .select("event_id, league, home, away, kickoff")
      .eq("status", "upcoming")
      .lt("kickoff", cutoff)
      .order("kickoff", { ascending: false })
      .limit(SAMPLE),
    supabase
      .from("matches")
      .select("kickoff, home, away")
      .eq("status", "finished")
      .order("kickoff", { ascending: false })
      .limit(1),
  ])

  if (error) {
    return NextResponse.json(
      { ok: false, reason: "database unreachable", error: error.message },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    )
  }

  const behind = stale ?? []
  const last = recent?.[0] ?? null

  return NextResponse.json(
    {
      ok: behind.length === 0,
      checkedAt: new Date(now).toISOString(),
      /** Kicked off over 12h ago and still carries no result. Zero is healthy. */
      unsettledFixtures: behind.length,
      /** Capped by the query, so `unsettledFixtures` may be an undercount. */
      sampleTruncated: behind.length === SAMPLE,
      examples: behind.slice(0, 5).map((m) => ({
        league: m.league,
        match: `${m.home} v ${m.away}`,
        kickoff: m.kickoff,
      })),
      lastResult: last
        ? {
            match: `${last.home} v ${last.away}`,
            kickoff: last.kickoff,
            ageHours: Math.round((now - Date.parse(last.kickoff)) / 3_600_000),
          }
        : null,
    },
    {
      // 503 so an uptime check notices without having to parse the body.
      status: behind.length === 0 ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  )
}
