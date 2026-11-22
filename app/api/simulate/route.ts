import { NextResponse } from "next/server"
import { cacheLife } from "next/cache"
import { supabase, fetchAllRows } from "@/lib/supabase"
import { resolveSeason } from "@/lib/seasons"
import { fetchTeamData } from "@/lib/teams"
import { UCL } from "@/lib/competition"
import { expectedGoals, uclStrengths, PREDICTION_STATS, UCL_HOME_MULT } from "@/lib/predictions"
import { loadModelFit } from "@/lib/fitted-model"
import type { Comp, SimPack, SimPlayer, SimRow } from "@/lib/simulate"

/**
 * Everything the season simulator needs to play out a competition in the
 * browser: the table so far, every unplayed fixture already rated, each
 * club's scorers, and (for the Champions League) the goal rates the knockout
 * ties will be drawn from once the bracket exists.
 *
 *   GET /api/simulate?comp=league|ucl&season=2026/27
 *
 * The simulation itself runs client-side so "re-run" and "next round" cost
 * nothing; this is the one heavy read, cached like the rest of the season
 * loaders.
 */

const HOME_LEAGUE = "La Liga"
/** Enough names per club to vary the scorers without shipping every reserve. */
const SQUAD_DEPTH = 14

type Upcoming = {
  event_id: number
  league: string
  round: number | null
  date: string
  kickoff: string | null
  home: string
  home_id: number | null
  away: string
  away_id: number | null
}

type PlayerRow = {
  player: string
  slug: string
  team: string
  team_id: number | null
  goals: number | null
  assists: number | null
  minutes: number | null
}

async function loadPack(season: string, comp: Comp): Promise<SimPack> {
  "use cache"
  cacheLife("hours")

  const league = comp === "ucl" ? UCL : HOME_LEAGUE
  // Every competition's results, not just this one's: the Champions League
  // model rates a club on its domestic form as well.
  const [{ table, stats, xg, matches }, upcoming, players] = await Promise.all([
    fetchTeamData(supabase, season, PREDICTION_STATS),
    fetchAllRows<Upcoming>((from, to) =>
      supabase
        .from("matches")
        .select("event_id, league, round, date, kickoff, home, home_id, away, away_id")
        .eq("season", season)
        .eq("league", league)
        .eq("status", "upcoming")
        .not("round", "is", null)
        .order("event_id", { ascending: true })
        .range(from, to),
    ),
    fetchAllRows<PlayerRow>((from, to) =>
      supabase
        .from("players")
        .select("player, slug, team, team_id, goals, assists, minutes")
        .eq("season", season)
        .eq("league", league)
        .order("player_id", { ascending: true })
        .range(from, to),
    ),
  ])

  const finished = matches.map((m) => ({ ...m, date: m.date ?? "" }))
  // The same learnt settings the predictions run on, so a simulated season
  // and the odds on its fixtures never disagree.
  const lambdas = expectedGoals(
    upcoming.map((m) => ({ ...m, round: m.round as number })),
    finished,
    table,
    stats,
    xg,
    (await loadModelFit(season)).params,
  )

  const ids: Record<string, number> = {}
  for (const m of upcoming) {
    if (m.home_id) ids[m.home] = m.home_id
    if (m.away_id) ids[m.away] = m.away_id
  }
  const squads: Record<string, SimPlayer[]> = {}
  for (const p of players) {
    if (p.team_id && !ids[p.team]) ids[p.team] = p.team_id
    ;(squads[p.team] ??= []).push({
      player: p.player,
      slug: p.slug,
      goals: p.goals ?? 0,
      assists: p.assists ?? 0,
      minutes: p.minutes ?? 0,
    })
  }
  for (const team of Object.keys(squads)) {
    squads[team] = squads[team]
      .sort((a, b) => b.goals * 3 + b.assists + b.minutes / 300 - (a.goals * 3 + a.assists + a.minutes / 300))
      .slice(0, SQUAD_DEPTH)
  }

  const rows: SimRow[] = table
    .filter((t) => t.league === league)
    .map((t) => ({
      team: t.team, played: t.played, won: t.won, drawn: t.drawn, lost: t.lost,
      gf: t.goals_for, ga: t.goals_against, pts: t.points,
    }))
  // A club yet to play (none in practice, but a fresh season) still belongs in the table.
  const seen = new Set(rows.map((r) => r.team))
  for (const m of upcoming) {
    for (const team of [m.home, m.away]) {
      if (seen.has(team)) continue
      seen.add(team)
      rows.push({ team, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, pts: 0 })
    }
  }

  let ratings: SimPack["ratings"] = {}
  let avg = 1.4
  if (comp === "ucl") {
    const model = uclStrengths(finished, xg, seen)
    avg = model.avg
    ratings = Object.fromEntries(
      [...model.teams.values()].map((t) => [t.team, { attack: t.attack, defence: t.defence }]),
    )
  }

  return {
    comp,
    league,
    season,
    table: rows,
    fixtures: upcoming.map((m) => ({
      event_id: m.event_id,
      round: m.round as number,
      date: m.kickoff ?? m.date,
      home: m.home,
      away: m.away,
      lambda: lambdas.get(m.event_id) ?? [1.2, 1.1],
    })),
    ids,
    squads,
    ratings,
    avg,
    homeMult: UCL_HOME_MULT,
  }
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const comp: Comp = params.get("comp") === "ucl" ? "ucl" : "league"
  const season = resolveSeason(params.get("season"))
  const pack = await loadPack(season, comp)
  return NextResponse.json(pack, {
    headers: { "Cache-Control": "public, max-age=600, stale-while-revalidate=3600" },
  })
}
