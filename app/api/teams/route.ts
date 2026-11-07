import { NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"

/**
 * Teams with upcoming fixtures, and the next fixtures for one of them.
 *
 *   GET /api/teams                 -> every club the countdown can follow
 *   GET /api/teams?team_id=2817    -> that club's next fixtures
 *
 * One route because it is one resource: the picker asks what it may choose
 * from, then the pill asks about the choice. Both read the `matches` table
 * the rest of the app already uses — no new table, and the Sofascore ingest
 * is untouched.
 *
 * `revalidate` is rejected under nextConfig.cacheComponents, so freshness
 * comes from the header, the same as /api/streams.
 */

const COLS = "event_id, date, league, home, home_id, away, away_id"

/** Shape the nav pill consumes; mirrors NextBarcaMatch. */
type NextMatch = {
  event_id: number
  kickoff: string | null
  date: string
  league: string
  opponent: string
  opponent_id: number | null
  home: boolean
}

type Row = {
  event_id: number
  date: string
  league: string
  home: string
  home_id: number | null
  away: string
  away_id: number | null
  kickoff?: string | null
}

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("team_id")

  /** `kickoff` is a newer column; retry without it rather than fail if the
   *  database hasn't been migrated, exactly as the root layout does. */
  async function rows(withTeam: number | null, limit: number): Promise<Row[]> {
    let lastError = "unknown"
    for (const cols of [`${COLS}, kickoff`, COLS]) {
      let q = supabase
        .from("matches")
        .select(cols)
        .eq("status", "upcoming")
        .order("date", { ascending: true })
        .limit(limit)
      if (withTeam != null) {
        q = q.or(`home_id.eq.${withTeam},away_id.eq.${withTeam}`)
      }
      const { data, error } = await q
      if (data) return data as unknown as Row[]
      lastError = error?.message ?? "no rows and no error"
    }
    // Both column sets failed: log once, attributably, and let the caller
    // return an empty list rather than breaking the nav on every page.
    console.error(`[teams] fixture lookup failed (team=${withTeam ?? "all"}): ${lastError}`)
    return []
  }

  // ── One club's next fixtures ──
  if (raw != null) {
    const teamId = Number(raw)
    if (!Number.isSafeInteger(teamId) || teamId <= 0) {
      return NextResponse.json(
        { error: "team_id must be a positive integer" },
        { status: 400 },
      )
    }

    const matches: NextMatch[] = (await rows(teamId, 6)).map((r) => {
      const atHome = r.home_id === teamId
      return {
        event_id: r.event_id,
        kickoff: r.kickoff ?? null,
        date: r.date,
        league: r.league,
        opponent: atHome ? r.away : r.home,
        opponent_id: atHome ? r.away_id : r.home_id,
        home: atHome,
      }
    })

    return NextResponse.json(
      { matches },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } },
    )
  }

  // ── The selectable clubs ──
  //
  // Derived from fixtures rather than a team table: a club with nothing
  // scheduled gives the pill nothing to count down to, so it should not be
  // offered. A club playing in two competitions is listed once, under
  // whichever fixture comes first.
  const teams = new Map<number, { id: number; name: string; league: string }>()
  for (const r of await rows(null, 5000)) {
    if (r.home_id != null && !teams.has(r.home_id)) {
      teams.set(r.home_id, { id: r.home_id, name: r.home, league: r.league })
    }
    if (r.away_id != null && !teams.has(r.away_id)) {
      teams.set(r.away_id, { id: r.away_id, name: r.away, league: r.league })
    }
  }

  return NextResponse.json(
    { teams: [...teams.values()].sort((a, b) => a.name.localeCompare(b.name)) },
    { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
  )
}
