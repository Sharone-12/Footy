/**
 * One club's season, read back from results and match stats: the scarf, how
 * much each performance looked like the team's usual game, the points gap to
 * its rivals, and a profile of whoever it plays next.
 *
 * Written for Barça and named for it, but nothing here knows which club it is
 * given; the caller passes the team.
 */

export type SeasonMatch = {
  event_id: number
  league: string
  round: number | null
  date?: string | null
  home: string
  away: string
  home_goals: number | null
  away_goals: number | null
}

export type Stripe = {
  event_id: number
  date: string
  league: string
  opponent: string
  home: boolean
  gf: number
  ga: number
  result: "W" | "D" | "L"
}

/** Every played match for `team`, oldest first: one stripe of the scarf each. */
export function seasonScarf(matches: SeasonMatch[], team: string): Stripe[] {
  const out: Stripe[] = []
  for (const m of matches) {
    if (m.home_goals == null || m.away_goals == null) continue
    const home = m.home === team
    if (!home && m.away !== team) continue
    const gf = home ? m.home_goals : m.away_goals
    const ga = home ? m.away_goals : m.home_goals
    out.push({
      event_id: m.event_id,
      date: m.date ?? "",
      league: m.league,
      opponent: home ? m.away : m.home,
      home,
      gf,
      ga,
      result: gf > ga ? "W" : gf < ga ? "L" : "D",
    })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.event_id - b.event_id)
}

/**
 * How much each match looked like the team's own game, 0-100, 50 being a
 * typical night.
 *
 * Each stat is scored against the team's own season average rather than the
 * league's: against the league Barça "play like Barça" every week, and the
 * interesting question is which weeks they didn't. Needs five matches before
 * an average means anything.
 */
export function playedLikeUs(
  perMatch: Map<number, Record<string, number>>,
  stats: string[],
): Map<number, number> {
  const out = new Map<number, number>()
  if (perMatch.size < 5) return out

  const scale = stats.map((stat) => {
    const vals = [...perMatch.values()].map((m) => m[stat]).filter((v) => Number.isFinite(v))
    const mean = vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length)
    const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, vals.length))
    return { stat, mean, sd: sd || 1 }
  })

  for (const [id, m] of perMatch) {
    const zs = scale
      .filter((s) => Number.isFinite(m[s.stat]))
      .map((s) => (m[s.stat] - s.mean) / s.sd)
    if (!zs.length) continue
    const z = zs.reduce((a, b) => a + b, 0) / zs.length
    // One standard deviation across the board is 25 points.
    out.set(id, Math.round(Math.max(0, Math.min(100, 50 + z * 25))))
  }
  return out
}

export type Gap = {
  rounds: number[]
  rivals: { team: string; gap: number[] }[]
  /** The gap to the first rival on expected points, same rounds. */
  deserved: number[]
}

/**
 * Points gap from `team` to each rival after every round: positive is ahead.
 * `points` and `xPoints` are cumulative, indexed [round][team].
 */
export function pointsGap(
  race: { teams: string[]; rounds: number[]; points: number[][] },
  xPoints: number[][],
  team: string,
  rivals: string[],
): Gap | null {
  const me = race.teams.indexOf(team)
  const idx = rivals.map((r) => race.teams.indexOf(r)).filter((i) => i >= 0)
  if (me < 0 || !idx.length) return null
  return {
    rounds: race.rounds,
    rivals: idx.map((i) => ({
      team: race.teams[i],
      gap: race.points.map((row) => row[me] - row[i]),
    })),
    deserved: xPoints.map((row) => Math.round((row[me] - row[idx[0]]) * 10) / 10),
  }
}

export type Trait = { label: string; value: string; rank: number; of: number }

/**
 * Where a team stands in its league on each metric, 1 = best. `better` says
 * which direction is good, so conceding few ranks first.
 */
export function leagueRanks(
  team: string,
  rows: { team: string; metrics: Record<string, number> }[],
  spec: { key: string; label: string; better: "high" | "low"; fmt: (v: number) => string }[],
): Trait[] {
  const mine = rows.find((r) => r.team === team)
  if (!mine) return []
  return spec
    .filter((s) => Number.isFinite(mine.metrics[s.key]))
    .map((s) => {
      const v = mine.metrics[s.key]
      const ahead = rows.filter((r) => {
        const o = r.metrics[s.key]
        return Number.isFinite(o) && (s.better === "high" ? o > v : o < v)
      }).length
      return { label: s.label, value: s.fmt(v), rank: ahead + 1, of: rows.length }
    })
}

export type XiPlayer = { position: string; detailed_position?: string | null; minutes: number }

/** Left to right across a line, from whatever side the detailed position hints at. */
function side(p: XiPlayer): number {
  const d = (p.detailed_position ?? "").toUpperCase()
  const left = /\bL|^L|LW|LB|ML/.test(d)
  const right = /\bR|^R|RW|RB|MR/.test(d)
  return left && !right ? -1 : right && !left ? 1 : 0
}

/**
 * The most-used eleven in a 4-3-3: the players with the most minutes in each
 * line, with everyone else on the bench.
 *
 * Picked on minutes because that is what the data can vouch for. It is who
 * has played most, not a predicted line-up, and the page says so.
 */
export function mostUsedXI<T extends XiPlayer>(squad: T[]): {
  lines: { key: "fwd" | "mid" | "def" | "gk"; players: T[] }[]
  bench: T[]
} {
  const take = (bucket: string, n: number) =>
    squad
      .filter((p) => p.position === bucket)
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, n)
      .sort((a, b) => side(a) - side(b))
  const lines = [
    { key: "fwd" as const, players: take("Forward", 3) },
    { key: "mid" as const, players: take("Midfielder", 3) },
    { key: "def" as const, players: take("Defender", 4) },
    { key: "gk" as const, players: take("Goalkeeper", 1) },
  ]
  const picked = new Set(lines.flatMap((l) => l.players))
  return {
    lines,
    bench: squad.filter((p) => !picked.has(p)).sort((a, b) => b.minutes - a.minutes),
  }
}
