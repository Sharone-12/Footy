import { scopeLeague, type Competition } from "@/lib/competition"
import { fetchAllRows } from "@/lib/supabase"

export const CURRENT_SEASON = "2026/27"

/** Leagues ingested in full, so their `team_table` is a real standings table. */
export const FULL_LEAGUES = [
  "Premier League",
  "La Liga",
  "Serie A",
  "Ligue 1",
  "Bundesliga",
  "Champions League",
] as const

/**
 * Clubs tracked on their own, without the rest of their league. Only these
 * teams' fixtures are ingested, so `team_table` rows for their opponents are
 * fragments (two games, not 34) — never render those leagues as a table.
 * `team` must match Sofascore exactly; see LEAGUES in data_loader.py.
 *
 * Empty now that all five top leagues are ingested in full. Kept because it is
 * the lever for adding one club from a league we do not otherwise carry.
 */
export const SINGLE_CLUBS: { team: string; short: string; league: string }[] = []

// `stat` values match the `stat` column in match_stats verbatim.
// pct: read the parsed percentage column instead of the raw leading number
// (e.g. "Ball possession" stores '68%', "Tackles won" stores '83%').
export type TeamStat = { stat: string; label: string; pct?: boolean }

export const TEAM_STAT_GROUPS: { label: string; stats: TeamStat[] }[] = [
  {
    label: "Attacking",
    stats: [
      { stat: "Expected goals", label: "xG" },
      { stat: "Total shots", label: "Shots" },
      { stat: "Shots on target", label: "On Target" },
      { stat: "Big chances", label: "Big Chances" },
      { stat: "Shots inside box", label: "Shots in Box" },
      { stat: "Touches in penalty area", label: "Box Touches" },
    ],
  },
  {
    label: "Possession & Build-up",
    stats: [
      { stat: "Ball possession", label: "Possession %", pct: true },
      { stat: "Accurate passes", label: "Accurate Passes" },
      { stat: "Final third entries", label: "Final Third Entries" },
      { stat: "Long balls", label: "Long Balls" },
      { stat: "Through balls", label: "Through Balls" },
      { stat: "Dribbles", label: "Dribbles" },
    ],
  },
  {
    label: "Defending",
    stats: [
      { stat: "Tackles", label: "Tackles" },
      { stat: "Tackles won", label: "Tackles Won %", pct: true },
      { stat: "Interceptions", label: "Interceptions" },
      { stat: "Clearances", label: "Clearances" },
      { stat: "Recoveries", label: "Recoveries" },
      { stat: "Blocked shots", label: "Blocked Shots" },
    ],
  },
  {
    label: "Duels & Physical",
    stats: [
      { stat: "Duels", label: "Duels" },
      { stat: "Ground duels", label: "Ground Duels" },
      { stat: "Aerial duels", label: "Aerial Duels" },
      { stat: "Distance covered", label: "Distance (km)" },
      { stat: "Number of sprints", label: "Sprints" },
      { stat: "Fouls", label: "Fouls" },
    ],
  },
  {
    label: "Goalkeeping",
    stats: [
      { stat: "Goalkeeper saves", label: "Saves" },
      { stat: "Goals prevented", label: "Goals Prevented" },
      { stat: "Big saves", label: "Big Saves" },
      { stat: "High claims", label: "High Claims" },
    ],
  },
]

// Radar axes: the six that best separate playing styles.
export const TEAM_RADAR_STATS: TeamStat[] = [
  { stat: "Ball possession", label: "Possession", pct: true },
  { stat: "Expected goals", label: "xG" },
  { stat: "Total shots", label: "Shots" },
  { stat: "Final third entries", label: "Final Third" },
  { stat: "Tackles", label: "Tackles" },
  { stat: "Recoveries", label: "Recoveries" },
]

export const TEAM_COLORS = ["#4ade80", "#60a5fa", "#fbbf24"]

/** Podium tint for a top-five list, brightest first. Shared by every ranking. */
export const POWER_COLORS = [
  "oklch(0.85 0.18 145)",
  "oklch(0.78 0.15 145)",
  "oklch(0.72 0.12 145)",
  "oklch(0.66 0.09 145)",
  "oklch(0.60 0.06 145)",
]

/** Short league badges. Keep in sync with LEAGUE_SHORT in lib/search.ts. */
export const LEAGUE_ABBR: Record<string, string> = {
  "Premier League": "PL",
  "La Liga": "LL",
  "Serie A": "SA",
  "Ligue 1": "L1",
  Bundesliga: "BL",
  "Champions League": "UCL",
}

/**
 * The chips on /predictions. Derived from FULL_LEAGUES so a new league shows
 * up by editing one list, and abbreviated throughout because seven spelled-out
 * names do not fit a phone.
 */
export const LEAGUE_FILTERS: { key: string; label: string; full: string }[] = [
  { key: "all", label: "All", full: "" },
  ...FULL_LEAGUES.map((full) => ({ key: LEAGUE_ABBR[full], label: LEAGUE_ABBR[full], full })),
]

/** Sofascore tournament IDs, used for league crest images. */
export const BARCA_ID = 2817

export const LEAGUE_TOURNAMENT_ID: Record<string, number> = {
  "Premier League": 17,
  "premier-league": 17,
  premierleague: 17,
  epl: 17,
  "La Liga": 8,
  LaLiga: 8,
  laliga: 8,
  "la-liga": 8,
  "Serie A": 23,
  "serie-a": 23,
  seriea: 23,
  "Ligue 1": 34,
  "ligue-1": 34,
  ligue1: 34,
  Bundesliga: 35,
  bundesliga: 35,
  "Champions League": 7,
  "champions-league": 7,
  ucl: 7,
  "UEFA Champions League": 7,
  "Europa League": 679,
  "europa-league": 679,
  uel: 679,
  "UEFA Europa League": 679,
  "Conference League": 17015,
  "conference-league": 17015,
  uecl: 17015,
  "UEFA Conference League": 17015,
  "FA Cup": 19,
  "Carabao Cup": 201,
  "EFL Cup": 201,
  "Copa del Rey": 327,
  "Super Cup": 213,
  "Supercopa de España": 213,
  "Supercopa de Espana": 213,
  "Coppa Italia": 326,
  "DFB-Pokal": 209,
  "Coupe de France": 328,
}

/** Robust resolver to match any league string (case-insensitive, normalized) to a tournament ID */
export function getLeagueTournamentId(name?: string | null): number | undefined {
  if (!name) return undefined
  if (LEAGUE_TOURNAMENT_ID[name]) return LEAGUE_TOURNAMENT_ID[name]

  const clean = name.toLowerCase().replace(/[^a-z0-9]/g, "")
  if (clean.includes("premier") || clean.includes("epl")) return 17
  if (clean.includes("laliga") || clean.includes("liga") || clean.includes("spain")) return 8
  if (clean.includes("seriea") || clean.includes("italy")) return 23
  if (clean.includes("bundesliga") || clean.includes("germany")) return 35
  if (clean.includes("ligue1") || clean.includes("france")) return 34
  if (clean.includes("champions") || clean.includes("ucl")) return 7
  if (clean.includes("europa") || clean.includes("uel")) return 679
  if (clean.includes("conference") || clean.includes("uecl")) return 17015
  if (clean.includes("copadelrey")) return 327
  if (clean.includes("facup")) return 19
  if (clean.includes("carabao") || clean.includes("eflcup")) return 201
  if (clean.includes("coppaitalia")) return 326
  if (clean.includes("dfb")) return 209

  return undefined
}

/** The three headline per-match numbers shown on a single-club card. */
export const CLUB_CARD_STATS: TeamStat[] = [
  { stat: "Ball possession", label: "Possession", pct: true },
  { stat: "Expected goals", label: "xG" },
  { stat: "Total shots", label: "Shots" },
]

export type SeasonStatRow = {
  team: string
  stat: string
  per_match: number | string | null
  pct: number | string | null
  matches: number
}

export type TeamTableRow = {
  season: string
  league: string
  team: string
  played: number
  won: number
  drawn: number
  lost: number
  goals_for: number
  goals_against: number
  goal_diff: number
  points: number
}

/** Parse a raw Sofascore stat string into its numeric value and percentage. */
export function parseRaw(raw: string | null): { value: number | null; pct: number | null } {
  if (!raw) return { value: null, pct: null }
  const valMatch = raw.match(/^(-?[0-9]+\.?[0-9]*)/)
  const pctMatch = raw.match(/([0-9]+)%/)
  return {
    value: valMatch ? Number(valMatch[1]) : null,
    pct: pctMatch ? Number(pctMatch[1]) : null,
  }
}

/** Pick the right column for a stat and coerce the numeric-typed string Postgres returns. */
export function statValue(row: SeasonStatRow | undefined, spec: TeamStat): number {
  if (!row) return 0
  const raw = spec.pct ? (row.pct ?? row.per_match) : row.per_match
  return raw == null ? 0 : Number(raw)
}

/** Index rows by `${team}|${stat}` for O(1) lookup while building chart data. */
export function indexStats(rows: SeasonStatRow[]): Map<string, SeasonStatRow> {
  const map = new Map<string, SeasonStatRow>()
  for (const r of rows) map.set(`${r.team}|${r.stat}`, r)
  return map
}

/**
 * Build a team-name → Sofascore team_id map for crest rendering. The team
 * table (standings) is derived from `matches`, which has no team_id column,
 * so the id comes from `players` — the only table that carries it.
 */
export async function fetchTeamIdMap(
  supabase: { from: (t: string) => any },
  season: string,
): Promise<Map<string, number>> {
  // Paged: a season holds 2631 player rows, and one request comes back
  // silently cut to 1000, which drops the crest for every club whose players
  // happen to sit past the boundary.
  const data = await fetchAllRows<{ team: string; team_id: number }>((from, to) =>
    supabase
      .from("players")
      .select("team, team_id")
      .eq("season", season)
      .not("team_id", "is", null)
      .order("player_id", { ascending: true })
      .range(from, to),
  )
  const map = new Map<string, number>()
  for (const r of (data || []) as { team: string; team_id: number }[]) {
    if (!map.has(r.team)) map.set(r.team, r.team_id)
  }
  return map
}

/**
 * Fetch matches + match_stats from base tables and compute standings + per-team
 * stat averages client-side, bypassing SQL views entirely.
 */
export async function fetchTeamData(
  supabase: { from: (t: string) => any },
  season: string,
  wantedStats: string[],
  /** Omit for every competition (predictions need all of them). */
  comp?: Competition,
): Promise<{ table: TeamTableRow[]; stats: SeasonStatRow[]; xg: MatchXg }> {
  // Paged: 25/26 alone holds 1895 finished matches, and a single request
  // would come back silently truncated at 1000, building a standings table
  // from half a season.
  const matchData = await fetchAllRows((from, to) => {
    let query = supabase
      .from("matches")
      .select("event_id, league, season, home, away, status, home_goals, away_goals")
      .eq("season", season)
      .eq("status", "finished")
    if (comp) query = scopeLeague(query, comp)
    return query.order("event_id", { ascending: true }).range(from, to)
  })

  const matchRows = (matchData || []) as {
    event_id: number; league: string; season: string
    home: string; away: string; status: string
    home_goals: number | null; away_goals: number | null
  }[]

  const matchById = new Map(matchRows.map((m: any) => [m.event_id, m]))
  const eventIds = matchRows.map((m: any) => m.event_id)

  const rawStats: { event_id: number; stat: string; home: string; away: string }[] = []
  // PostgREST caps every response at 1000 rows and truncates silently, so a
  // batch must hold at most 1000 / wantedStats rows' worth of matches. A flat
  // 50 lost most of the match page's stats (50 matches x ~40 stats).
  const perBatch = Math.max(1, Math.min(50, Math.floor(1000 / Math.max(1, wantedStats.length))))
  const batches: number[][] = []
  for (let i = 0; i < eventIds.length; i += perBatch) {
    batches.push(eventIds.slice(i, i + perBatch))
  }
  const results = await Promise.all(
    batches.map((batch) =>
      supabase
        .from("match_stats")
        .select("event_id, stat, home, away")
        .in("event_id", batch)
        .in("stat", wantedStats)
        .limit(1000),
    ),
  )
  for (const { data } of results) {
    if (data) rawStats.push(...data)
  }

  // Judged per match, not per club: Marseille is a real Champions League side
  // but only a two-game fragment in Ligue 1, where we track PSG alone.
  const fullLeagueSet = new Set<string>(FULL_LEAGUES)
  const singleClubNames = new Set<string>(SINGLE_CLUBS.map((c) => c.team))
  const allowed = (team: string, league: string) =>
    fullLeagueSet.has(league) || singleClubNames.has(team)

  // Keyed by league as well as club: Arsenal's Premier League and Champions
  // League records are separate tables, and merging them dropped every club
  // with a domestic league out of the Champions League table.
  const teamMap = new Map<string, { team: string; league: string; gf: number; ga: number; w: number; d: number; l: number; p: number }>()
  function addSide(team: string, league: string, gf: number, ga: number) {
    if (!allowed(team, league)) return
    const key = `${league}|${team}`
    let t = teamMap.get(key)
    if (!t) { t = { team, league, gf: 0, ga: 0, w: 0, d: 0, l: 0, p: 0 }; teamMap.set(key, t) }
    t.gf += gf; t.ga += ga; t.p++
    if (gf > ga) t.w++; else if (gf === ga) t.d++; else t.l++
  }
  for (const m of matchRows) {
    if (m.home_goals != null && m.away_goals != null) {
      addSide(m.home, m.league, m.home_goals, m.away_goals)
      addSide(m.away, m.league, m.away_goals, m.home_goals)
    }
  }
  const table: TeamTableRow[] = []
  for (const t of teamMap.values()) {
    table.push({
      season, league: t.league, team: t.team, played: t.p,
      won: t.w, drawn: t.d, lost: t.l,
      goals_for: t.gf, goals_against: t.ga,
      goal_diff: t.gf - t.ga,
      points: t.w * 3 + t.d,
    })
  }
  // Points alone leaves ties in arbitrary order — a whole round of 3-pointers
  // early in the Champions League. Goal difference, then goals scored, is the
  // first tie-break in every competition we show.
  table.sort(
    (a, b) =>
      b.points - a.points ||
      b.goal_diff - a.goal_diff ||
      b.goals_for - a.goals_for ||
      a.team.localeCompare(b.team),
  )

  type Acc = { sum: number; pctSum: number; count: number }
  const accMap = new Map<string, Acc>()
  for (const rs of rawStats) {
    const m = matchById.get(rs.event_id) as any
    if (!m) continue
    const sides: [string, string][] = [[m.home, rs.home], [m.away, rs.away]]
    for (const [team, raw] of sides) {
      if (!allowed(team, m.league)) continue
      const { value, pct } = parseRaw(raw)
      if (value == null && pct == null) continue
      const key = `${team}|${rs.stat}`
      let acc = accMap.get(key)
      if (!acc) { acc = { sum: 0, pctSum: 0, count: 0 }; accMap.set(key, acc) }
      acc.sum += value ?? 0
      acc.pctSum += pct ?? 0
      acc.count++
    }
  }

  const stats: SeasonStatRow[] = []
  for (const [key, acc] of accMap) {
    const [team, stat] = key.split("|")
    stats.push({
      team, stat,
      per_match: Math.round((acc.sum / acc.count) * 100) / 100,
      pct: Math.round((acc.pctSum / acc.count) * 10) / 10,
      matches: acc.count,
    })
  }

  // Per-match xG, kept unaggregated: the Champions League model needs each
  // side's xG against as well as for, which the per-team averages lose.
  const xg: MatchXg = new Map()
  for (const rs of rawStats) {
    if (rs.stat !== "Expected goals" || xg.has(rs.event_id)) continue
    const h = parseRaw(rs.home).value
    const a = parseRaw(rs.away).value
    if (h != null && a != null) xg.set(rs.event_id, [h, a])
  }

  return { table, stats, xg }
}

/** event_id -> [home xG, away xG]. */
export type MatchXg = Map<number, [number, number]>

/**
 * One row per club, for views that list clubs rather than a competition:
 * its domestic league where it has one, else its Champions League row.
 */
export function primaryRows(table: TeamTableRow[]): TeamTableRow[] {
  const byTeam = new Map<string, TeamTableRow>()
  for (const t of table) {
    const seen = byTeam.get(t.team)
    if (!seen || seen.league === "Champions League") byTeam.set(t.team, t)
  }
  return [...byTeam.values()]
}
