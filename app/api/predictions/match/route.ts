import { NextRequest, NextResponse } from "next/server"
import { supabase, fetchAllRows } from "@/lib/supabase"
import { resolveSeason } from "@/lib/seasons"
import { fetchTeamData, isPredictable, TEAM_STAT_GROUPS, TEAM_RADAR_STATS } from "@/lib/teams"
import { predictMatches, type MatchPrediction } from "@/lib/predictions"
import { withFrozenPredictions } from "@/lib/predictions-freeze"

const ALL_STATS = Array.from(
  new Set([
    ...TEAM_RADAR_STATS.map((s) => s.stat),
    ...TEAM_STAT_GROUPS.flatMap((g) => g.stats.map((s) => s.stat)),
  ]),
)

const CACHE_TTL_MS = 5 * 60_000 // 5 minutes
const cache = new Map<number, { timestamp: number; prediction: MatchPrediction | null }>()

export async function getMatchPrediction(eventId: number): Promise<MatchPrediction | null> {
  const cached = cache.get(eventId)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.prediction
  }

  const season = resolveSeason()
  const [{ table, stats, xg }, allMatchData] = await Promise.all([
    fetchTeamData(supabase, season, ALL_STATS),
    fetchAllRows((from, to) =>
      supabase
        .from("matches")
        .select("event_id, league, season, round, date, kickoff, home, home_id, away, away_id, status, home_goals, away_goals")
        .eq("season", season)
        .order("event_id", { ascending: true })
        .range(from, to),
    ),
  ])

  const allMatches = (allMatchData || []) as {
    event_id: number
    league: string
    season: string
    round: number
    date: string
    kickoff?: string | null
    home: string
    home_id: number | null
    away: string
    away_id: number | null
    status: string
    home_goals: number | null
    away_goals: number | null
  }[]

  const match = allMatches.find((m) => m.event_id === eventId)
  // International fixtures ride in the same table but have no standings, no
  // season-long stats and no form behind them — six games of a Nations League
  // group is not a model. Rating them would invent confidence we don't have.
  if (!match || !isPredictable(match.league)) {
    cache.set(eventId, { timestamp: Date.now(), prediction: null })
    return null
  }

  const finished = allMatches.filter((m) => m.status === "finished")

  const computed = predictMatches(
    [
      {
        event_id: match.event_id,
        league: match.league,
        round: match.round,
        date: match.date,
        kickoff: match.kickoff,
        home: match.home,
        home_id: match.home_id,
        away: match.away,
        away_id: match.away_id,
      },
    ],
    finished,
    table,
    stats,
    xg,
  )

  const [pred] = await withFrozenPredictions(computed)
  const result = pred || null
  cache.set(eventId, { timestamp: Date.now(), prediction: result })
  return result
}

export async function GET(req: NextRequest) {
  const idStr = req.nextUrl.searchParams.get("id") || req.nextUrl.searchParams.get("event_id")
  const eventId = idStr ? Number(idStr) : null

  if (!eventId || Number.isNaN(eventId)) {
    return NextResponse.json({ error: "Missing or invalid id parameter" }, { status: 400 })
  }

  try {
    const prediction = await getMatchPrediction(eventId)
    return NextResponse.json(
      { prediction },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      },
    )
  } catch (err) {
    console.error("[api/predictions/match] Error calculating prediction:", err)
    return NextResponse.json(
      { error: "Failed to calculate prediction" },
      { status: 500 },
    )
  }
}
