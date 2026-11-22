import { cacheLife } from "next/cache"
import { supabase, fetchAllRows } from "@/lib/supabase"
import { SEASONS } from "@/lib/seasons"
import { FULL_LEAGUES, parseRaw } from "@/lib/teams"
import { UCL } from "@/lib/competition"
import {
  fitLeagueParams,
  walkForward,
  DEFAULT_PARAMS,
  COIN_FLIP_LOSS,
  type LearnMatch,
  type Params,
  type Score,
  type StatLine,
} from "@/lib/learn"

/**
 * The model's parameters, learnt from results rather than chosen by hand.
 *
 * Fitting is a walk forward over every finished league match (see lib/learn):
 * each one is predicted from the record before it and scored, and the
 * parameter set with the lowest log-loss wins. The twice-daily refresh lands
 * new results, this recomputes within the day, and the predictions move with
 * it.
 *
 * `tested` is the honest mark: parameters fitted on the previous season only,
 * scored on this one, against the hand-set model over the same matches. The
 * production `params` are then fitted on everything finished, because an
 * upcoming match is unseen either way.
 */

/** The Champions League carries its own model, hand-fitted; see lib/predictions. */
const LEAGUES = FULL_LEAGUES.filter((l) => l !== UCL)

const STAT_MAP: Record<string, keyof StatLine> = {
  "Expected goals": "xg",
  "Shots on target": "sot",
  "Big chances": "bc",
  "Shots inside box": "sib",
  "Ball possession": "poss",
  "Goals prevented": "gp",
}
const STATS = Object.keys(STAT_MAP)

/** Matches per request for stats: 120 x 6 stats stays under PostgREST's 1000. */
const STAT_BATCH = 120

/** Below this there is nothing to learn, and a fit would just chase noise. */
const MIN_TRAINING_MATCHES = 200

export type ModelFit = {
  params: Params
  /** Matches the production fit learnt from. */
  trained: number
  /** Seasons those matches came from, newest first. */
  seasons: string[]
  /**
   * Out-of-sample mark, or null when there is no earlier season to train on.
   * Both scores cover exactly the same matches.
   */
  tested: { season: string; learnt: Score; handSet: Score } | null
}

export const COIN_FLIP = COIN_FLIP_LOSS

/** How much of the gap from a coin flip to certainty a log-loss closes, 0-100. */
export const skillOf = (logLoss: number) =>
  Math.round((1 - logLoss / COIN_FLIP_LOSS) * 1000) / 10

type MatchRow = {
  event_id: number
  league: string
  season: string
  date: string
  home: string
  away: string
  home_goals: number | null
  away_goals: number | null
}

/** Finished league matches with their per-match stats, oldest first. */
async function loadLearnMatches(seasons: string[]): Promise<LearnMatch[]> {
  const rows = await fetchAllRows<MatchRow>((from, to) =>
    supabase
      .from("matches")
      .select("event_id, league, season, date, home, away, home_goals, away_goals")
      .in("season", seasons)
      .in("league", LEAGUES as unknown as string[])
      .eq("status", "finished")
      .order("date", { ascending: true })
      .order("event_id", { ascending: true })
      .range(from, to),
  )
  const played = rows.filter((m) => m.home_goals != null && m.away_goals != null)
  if (played.length === 0) return []

  const batches: number[][] = []
  for (let i = 0; i < played.length; i += STAT_BATCH) {
    batches.push(played.slice(i, i + STAT_BATCH).map((m) => m.event_id))
  }
  const results = await Promise.all(
    batches.map((batch) =>
      supabase
        .from("match_stats")
        .select("event_id, stat, home, away")
        .in("event_id", batch)
        .in("stat", STATS)
        .limit(1000),
    ),
  )

  const byEvent = new Map<number, { home: StatLine; away: StatLine }>()
  for (const { data } of results) {
    for (const r of (data ?? []) as { event_id: number; stat: string; home: string; away: string }[]) {
      const key = STAT_MAP[r.stat]
      if (!key) continue
      const entry = byEvent.get(r.event_id) ?? { home: {}, away: {} }
      for (const side of ["home", "away"] as const) {
        const { value, pct } = parseRaw(r[side])
        // Possession carries its sign ("64%"); everything else leads with the number.
        const v = key === "poss" ? pct : value
        if (v != null) entry[side][key] = v
      }
      byEvent.set(r.event_id, entry)
    }
  }

  return played.map((m) => {
    const stats = byEvent.get(m.event_id)
    return {
      event_id: m.event_id,
      season: m.season,
      league: m.league,
      date: m.date,
      home: m.home,
      away: m.away,
      homeGoals: m.home_goals as number,
      awayGoals: m.away_goals as number,
      homeStats: stats?.home,
      awayStats: stats?.away,
    }
  })
}

/**
 * Fit the model for a season.
 *
 * Cached for a day: this reads a couple of thousand matches and replays them
 * a few hundred times, and parameters that moved between page loads would be
 * worse than useless — two people would see different odds on one fixture.
 */
export async function loadModelFit(season: string): Promise<ModelFit> {
  "use cache"
  cacheLife("days")

  // The season being predicted, plus the one before it to learn from.
  const index = SEASONS.indexOf(season as (typeof SEASONS)[number])
  const prior = index >= 0 ? SEASONS[index + 1] : undefined
  const seasons = prior ? [season, prior] : [season]

  const matches = await loadLearnMatches(seasons)
  if (matches.length < MIN_TRAINING_MATCHES) {
    return { params: DEFAULT_PARAMS, trained: 0, seasons, tested: null }
  }

  const params = fitLeagueParams(matches).params

  let tested: ModelFit["tested"] = null
  if (prior) {
    const trainOnly = matches.filter((m) => m.season === prior)
    if (trainOnly.length >= MIN_TRAINING_MATCHES) {
      // Marked on the season its parameters never saw.
      const honest = fitLeagueParams(trainOnly).params
      const learnt = walkForward(matches, honest, season)
      if (learnt.n > 0) {
        tested = { season, learnt, handSet: walkForward(matches, DEFAULT_PARAMS, season) }
      }
    }
  }

  return { params, trained: matches.length, seasons, tested }
}
