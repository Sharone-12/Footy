/**
 * What the table would look like if results followed chances, and how the
 * real table got to where it is.
 */
import { matchProbabilities } from "./poisson.ts"

export type TableMatch = {
  event_id: number
  league: string
  round: number | null
  home: string
  away: string
  home_goals: number | null
  away_goals: number | null
}

/** Expected points for [home, away] from a match's xG. */
export function expectedPoints(xgHome: number, xgAway: number): [number, number] {
  const p = matchProbabilities(xgHome, xgAway)
  return [3 * p.homeWin + p.draw, 3 * p.awayWin + p.draw]
}

export type JusticeRow = {
  league: string
  team: string
  /** Matches that had xG; both columns below cover exactly these. */
  played: number
  points: number
  xPoints: number
  /** points − xPoints: positive is a side running ahead of its chances. */
  luck: number
  /** Table position on real points, and on expected points, 1-based. */
  rank: number
  xRank: number
}

const pts = (gf: number, ga: number) => (gf > ga ? 3 : gf === ga ? 1 : 0)

/**
 * Real against expected points, per club per league.
 *
 * Only matches with xG count, and for both columns: comparing expected points
 * from 9 matches with real points from 11 would report two games' worth of
 * points as luck.
 */
export function justiceTable(
  matches: TableMatch[],
  xg: Map<number, [number, number]>,
): JusticeRow[] {
  const acc = new Map<string, { league: string; team: string; played: number; points: number; xPoints: number }>()
  const side = (league: string, team: string, points: number, xPoints: number) => {
    const key = `${league}|${team}`
    let t = acc.get(key)
    if (!t) acc.set(key, (t = { league, team, played: 0, points: 0, xPoints: 0 }))
    t.played++
    t.points += points
    t.xPoints += xPoints
  }
  for (const m of matches) {
    const x = xg.get(m.event_id)
    if (!x || m.home_goals == null || m.away_goals == null) continue
    const [xh, xa] = expectedPoints(x[0], x[1])
    side(m.league, m.home, pts(m.home_goals, m.away_goals), xh)
    side(m.league, m.away, pts(m.away_goals, m.home_goals), xa)
  }

  const rows = [...acc.values()].map((t) => ({
    ...t,
    xPoints: Math.round(t.xPoints * 10) / 10,
    luck: Math.round((t.points - t.xPoints) * 10) / 10,
    rank: 0,
    xRank: 0,
  }))
  for (const league of new Set(rows.map((r) => r.league))) {
    const inLeague = rows.filter((r) => r.league === league)
    ;[...inLeague].sort((a, b) => b.points - a.points).forEach((r, i) => (r.rank = i + 1))
    ;[...inLeague].sort((a, b) => b.xPoints - a.xPoints).forEach((r, i) => (r.xRank = i + 1))
  }
  return rows
}

export type Race = {
  league: string
  teams: string[]
  rounds: number[]
  /** points[r][t]: team t's points after round rounds[r]. */
  points: number[][]
  /** Goal difference at the same moment, the tie-break. */
  gd: number[][]
}

/**
 * The season replayed: cumulative points per club after each round.
 *
 * Keyed by round number rather than date, so a postponed fixture lands in the
 * round it belongs to and the table at "round 9" is the one people remember.
 */
export function tableRace(matches: TableMatch[], league: string): Race | null {
  const played = matches.filter(
    (m) => m.league === league && m.round != null && m.home_goals != null && m.away_goals != null,
  )
  const rounds = [...new Set(played.map((m) => m.round as number))].sort((a, b) => a - b)
  const teams = [...new Set(played.flatMap((m) => [m.home, m.away]))].sort()
  if (rounds.length < 2 || teams.length < 2) return null

  const index = new Map(teams.map((t, i) => [t, i]))
  const runPts = teams.map(() => 0)
  const runGd = teams.map(() => 0)
  const points: number[][] = []
  const gd: number[][] = []
  for (const round of rounds) {
    for (const m of played) {
      if (m.round !== round) continue
      const h = index.get(m.home)!
      const a = index.get(m.away)!
      const hg = m.home_goals as number
      const ag = m.away_goals as number
      runPts[h] += pts(hg, ag)
      runPts[a] += pts(ag, hg)
      runGd[h] += hg - ag
      runGd[a] += ag - hg
    }
    points.push([...runPts])
    gd.push([...runGd])
  }
  return { league, teams, rounds, points, gd }
}
