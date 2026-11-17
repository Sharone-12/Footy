/**
 * Season simulator.
 *
 * Plays the rest of a competition from the same expected goals the
 * predictions are priced on: one Poisson draw per side per match, scorers and
 * assisters drawn from each club's season record, and the table, the
 * Champions League seeding and the knockout bracket read off the results.
 *
 * Everything is a pure function of (pack, seed, steps). The page never holds
 * a half-played run; it re-derives the state it wants from the seed, which is
 * what makes "next round" and "re-run" trivially consistent.
 *
 * No @/ imports: `node lib/simulate.test.ts` runs it bare, like lib/barca.ts.
 */

export type Comp = "league" | "ucl"

export type SimPlayer = { player: string; slug: string; goals: number; assists: number; minutes: number }

export type SimFixture = {
  event_id: number
  round: number
  date: string
  home: string
  away: string
  /** Expected goals [home, away], from lib/predictions. */
  lambda: [number, number]
}

export type SimRow = {
  team: string
  played: number
  won: number
  drawn: number
  lost: number
  gf: number
  ga: number
  pts: number
}

export type SimPack = {
  comp: Comp
  league: string
  season: string
  /** The table as it stands. */
  table: SimRow[]
  /** Every unplayed fixture, each already rated. */
  fixtures: SimFixture[]
  /** Club -> Sofascore id, for crests. */
  ids: Record<string, number>
  /** Club -> its players this competition, for scorers. */
  squads: Record<string, SimPlayer[]>
  /** Goal rates vs an average side; the knockout ties are not fixtures yet. */
  ratings: Record<string, { attack: number; defence: number }>
  /** Average goals per side per match in this competition. */
  avg: number
  /** Home goal-rate multiplier (UCL_HOME_MULT in lib/predictions). */
  homeMult: number
}

export type Goal = { team: string; minute: number; scorer: string | null; assist: string | null }

export type SimResult = {
  event_id?: number
  round?: number
  date?: string
  home: string
  away: string
  hg: number
  ag: number
  goals: Goal[]
  /** Went to extra time (knockout second legs and finals only). */
  et?: boolean
}

export type Rng = () => number

/** mulberry32: tiny, and the same sequence for the same seed on every machine. */
export function rng(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Knuth's method; goals never get near the λ where it struggles. */
export function poisson(lambda: number, r: Rng): number {
  const limit = Math.exp(-lambda)
  let k = 0
  let p = 1
  do {
    k++
    p *= r()
  } while (p > limit)
  return Math.min(k - 1, 9)
}

function pickWeighted<T>(items: T[], weight: (t: T) => number, r: Rng): T | null {
  let total = 0
  for (const it of items) total += weight(it)
  if (total <= 0) return null
  let x = r() * total
  for (const it of items) {
    x -= weight(it)
    if (x <= 0) return it
  }
  return items[items.length - 1] ?? null
}

// ponytail: scorer odds are a flat mix of goals, assists and minutes, not a
// per-90 model. Swap for xG/xA per 90 if the names look wrong too often.
const scorerWeight = (p: SimPlayer) => p.goals * 3 + p.assists * 0.5 + p.minutes / 300 + 0.15
const assistWeight = (p: SimPlayer) => p.assists * 3 + p.goals * 0.5 + p.minutes / 300 + 0.15
/** Share of goals with no assist: penalties, own goals, solo runs. */
const UNASSISTED = 0.28

function goalsFor(team: string, n: number, squads: SimPack["squads"], r: Rng): Goal[] {
  const squad = squads[team] ?? []
  const out: Goal[] = []
  for (let i = 0; i < n; i++) {
    const scorer = pickWeighted(squad, scorerWeight, r)
    const assist =
      scorer && r() > UNASSISTED
        ? pickWeighted(
            squad.filter((p) => p !== scorer),
            assistWeight,
            r,
          )
        : null
    out.push({
      team,
      minute: 1 + Math.floor(r() * 90),
      scorer: scorer?.player ?? null,
      assist: assist?.player ?? null,
    })
  }
  return out
}

export function playMatch(
  home: string,
  away: string,
  lambda: [number, number],
  squads: SimPack["squads"],
  r: Rng,
): SimResult {
  const hg = poisson(lambda[0], r)
  const ag = poisson(lambda[1], r)
  const goals = [...goalsFor(home, hg, squads, r), ...goalsFor(away, ag, squads, r)].sort(
    (a, b) => a.minute - b.minute,
  )
  return { home, away, hg, ag, goals }
}

export const emptyRow = (team: string): SimRow => ({
  team, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, pts: 0,
})

export function applyResult(rows: Map<string, SimRow>, m: SimResult) {
  for (const [team, gf, ga] of [[m.home, m.hg, m.ag], [m.away, m.ag, m.hg]] as const) {
    const row = rows.get(team) ?? emptyRow(team)
    row.played++
    row.gf += gf
    row.ga += ga
    if (gf > ga) { row.won++; row.pts += 3 } else if (gf === ga) { row.drawn++; row.pts += 1 } else row.lost++
    rows.set(team, row)
  }
}

/** Points, goal difference, goals scored, name: the same order as the live table. */
export function sortRows(rows: Iterable<SimRow>): SimRow[] {
  return [...rows].sort(
    (a, b) => b.pts - a.pts || b.gf - b.ga - (a.gf - a.ga) || b.gf - a.gf || a.team.localeCompare(b.team),
  )
}

export type Round = { round: number; results: SimResult[] }

/** The round numbers still to play, in order. */
export function roundsOf(pack: SimPack): number[] {
  return [...new Set(pack.fixtures.map((f) => f.round))].sort((a, b) => a - b)
}

/**
 * The first `n` remaining rounds played out, and the table after them.
 * Clubs with fixtures but no row yet (none, in practice) start from zero.
 */
export function simulateRounds(pack: SimPack, seed: number, n: number): { rounds: Round[]; table: SimRow[] } {
  const r = rng(seed)
  const rows = new Map(pack.table.map((t) => [t.team, { ...t }]))
  const rounds: Round[] = []
  for (const round of roundsOf(pack).slice(0, n)) {
    const results = pack.fixtures
      .filter((f) => f.round === round)
      .sort((a, b) => a.date.localeCompare(b.date) || a.event_id - b.event_id)
      .map((f) => ({
        ...playMatch(f.home, f.away, f.lambda, pack.squads, r),
        event_id: f.event_id,
        round,
        date: f.date,
      }))
    for (const m of results) applyResult(rows, m)
    rounds.push({ round, results })
  }
  return { rounds, table: sortRows(rows.values()) }
}

// ── Champions League knockouts ──

export type Tie = {
  id: string
  /** Seeded side: hosts the second leg. Null until the feeder tie is decided. */
  a: string | null
  b: string | null
  /** Tie ids whose winners fill an empty slot. */
  fromA?: string
  fromB?: string
  /** Two legs, or one for the final. Empty until played. */
  legs: SimResult[]
  agg?: [number, number]
  winner?: string
  pens?: boolean
}

export type Bracket = {
  playoffs: Tie[]
  /** Bracket order: 0-3 the left half top to bottom, 4-7 the right. */
  r16: Tie[]
  qf: Tie[]
  sf: Tie[]
  final: Tie[]
}

export const KO_STAGES = ["playoffs", "r16", "qf", "sf", "final"] as const
export type KoStage = (typeof KO_STAGES)[number]

export const KO_LABEL: Record<KoStage, string> = {
  playoffs: "Knockout play-offs",
  r16: "Round of 16",
  qf: "Quarter-finals",
  sf: "Semi-finals",
  final: "Final",
}

/**
 * The bracket as UEFA draws it from the league-phase table.
 *
 * 1-8 go straight to the round of 16. 9-24 play off in fixed bands, 9/10 v
 * 23/24 down to 15/16 v 17/18, the seeded side at home second. Each pair of
 * top seeds then meets one band's winners: 1/2 the 15-18 band, 3/4 the 13-20
 * band, 5/6 the 11-22 band, 7/8 the 9-24 band. The two seeds of a pair sit in
 * opposite halves, and the halves are laid out so 1/2 meet 7/8 and 3/4 meet
 * 5/6 in the quarter-finals. Everything the draw leaves to chance is drawn
 * from `r`.
 */
export function drawBracket(order: string[], r: Rng): Bracket {
  const s = (seed: number) => order[seed - 1] ?? null
  const flip = () => r() < 0.5

  const playoffs: Tie[] = []
  for (let g = 0; g < 4; g++) {
    // Band g: seeds 9+2g / 10+2g against 24-2g / 23-2g.
    const seeded = [s(9 + 2 * g), s(10 + 2 * g)]
    const unseeded = [s(24 - 2 * g), s(23 - 2 * g)]
    if (flip()) unseeded.reverse()
    playoffs.push(
      { id: `po${g}a`, a: seeded[0], b: unseeded[0], legs: [] },
      { id: `po${g}b`, a: seeded[1], b: unseeded[1], legs: [] },
    )
  }

  // tie[p][side]: seed pair p (1/2, 3/4, 5/6, 7/8), side 0 left / 1 right.
  const tie: Tie[][] = []
  for (let p = 0; p < 4; p++) {
    const seeds = [s(1 + 2 * p), s(2 + 2 * p)]
    const band = 3 - p
    const feeders = [`po${band}a`, `po${band}b`]
    if (flip()) seeds.reverse()
    if (flip()) feeders.reverse()
    tie.push([
      { id: `r16-${p}-0`, a: seeds[0], b: null, fromB: feeders[0], legs: [] },
      { id: `r16-${p}-1`, a: seeds[1], b: null, fromB: feeders[1], legs: [] },
    ])
  }
  const r16 = [
    tie[1][0], tie[2][0], tie[0][0], tie[3][0],
    tie[0][1], tie[3][1], tie[2][1], tie[1][1],
  ]
  const next = (id: string, from: Tie[]): Tie[] => {
    const out: Tie[] = []
    for (let i = 0; i < from.length; i += 2) {
      out.push({ id: `${id}${i / 2}`, a: null, b: null, fromA: from[i].id, fromB: from[i + 1].id, legs: [] })
    }
    return out
  }
  const qf = next("qf", r16)
  const sf = next("sf", qf)
  const final = next("final", sf)
  return { playoffs, r16, qf, sf, final }
}

function lambdas(pack: SimPack, home: string, away: string, mult: number): [number, number] {
  const h = pack.ratings[home] ?? { attack: 1, defence: 1 }
  const a = pack.ratings[away] ?? { attack: 1, defence: 1 }
  return [
    Math.max(0.3, h.attack * a.defence * pack.avg * mult),
    Math.max(0.3, (a.attack * h.defence * pack.avg) / mult),
  ]
}

const rating = (pack: SimPack, team: string) => {
  const t = pack.ratings[team]
  return t ? t.attack - t.defence : 0
}

/** Extra time and penalties decide a level tie; the result is written into the last leg. */
function settle(tie: Tie, pack: SimPack, r: Rng, aGoals: number, bGoals: number) {
  const last = tie.legs[tie.legs.length - 1]
  if (aGoals === bGoals) {
    const [lh, la] = lambdas(pack, last.home, last.away, 1)
    const eh = poisson(lh / 3, r)
    const ea = poisson(la / 3, r)
    last.hg += eh
    last.ag += ea
    last.goals.push(
      ...goalsFor(last.home, eh, pack.squads, r).map((g) => ({ ...g, minute: 91 + Math.floor(r() * 30) })),
      ...goalsFor(last.away, ea, pack.squads, r).map((g) => ({ ...g, minute: 91 + Math.floor(r() * 30) })),
    )
    last.et = true
    const aIsHome = last.home === tie.a
    aGoals += aIsHome ? eh : ea
    bGoals += aIsHome ? ea : eh
  }
  tie.agg = [aGoals, bGoals]
  if (aGoals !== bGoals) {
    tie.winner = aGoals > bGoals ? tie.a! : tie.b!
    return
  }
  // ponytail: penalties are a weighted coin on the rating gap, no keeper model.
  const edge = Math.max(0.3, Math.min(0.7, 0.5 + 0.08 * (rating(pack, tie.a!) - rating(pack, tie.b!))))
  tie.pens = true
  tie.winner = r() < edge ? tie.a! : tie.b!
}

function playTie(tie: Tie, pack: SimPack, r: Rng, single: boolean) {
  if (!tie.a || !tie.b) return
  if (single) {
    tie.legs = [playMatch(tie.a, tie.b, lambdas(pack, tie.a, tie.b, 1), pack.squads, r)]
    settle(tie, pack, r, tie.legs[0].hg, tie.legs[0].ag)
    return
  }
  const leg1 = playMatch(tie.b, tie.a, lambdas(pack, tie.b, tie.a, pack.homeMult), pack.squads, r)
  const leg2 = playMatch(tie.a, tie.b, lambdas(pack, tie.a, tie.b, pack.homeMult), pack.squads, r)
  tie.legs = [leg1, leg2]
  settle(tie, pack, r, leg1.ag + leg2.hg, leg1.hg + leg2.ag)
}

/**
 * The bracket with its first `stages` rounds played (0 = drawn only, 5 = a
 * champion). Later rounds have their slots filled as far as the results allow.
 */
export function playKnockouts(bracket: Bracket, stages: number, pack: SimPack, r: Rng): Bracket {
  const b: Bracket = JSON.parse(JSON.stringify(bracket))
  const byId = new Map<string, Tie>()
  for (const stage of KO_STAGES) for (const t of b[stage]) byId.set(t.id, t)
  const fill = (t: Tie) => {
    if (!t.a && t.fromA) t.a = byId.get(t.fromA)?.winner ?? null
    if (!t.b && t.fromB) t.b = byId.get(t.fromB)?.winner ?? null
  }
  KO_STAGES.forEach((stage, i) => {
    for (const t of b[stage]) {
      fill(t)
      if (i < stages) playTie(t, pack, r, stage === "final")
    }
  })
  return b
}

/** The rng position after the league phase, so the knockouts continue the same run. */
export function knockoutRng(seed: number): Rng {
  return rng(seed ^ 0x9e3779b9)
}

/** Where a club finished and what that means: 1-8 straight through, 9-24 play off, the rest out. */
export function uclZone(rank: number): "r16" | "playoff" | "out" {
  return rank <= 8 ? "r16" : rank <= 24 ? "playoff" : "out"
}
