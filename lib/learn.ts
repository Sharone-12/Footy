/**
 * The prediction model's parameters, and how they are learnt from results.
 *
 * Every number the match model leans on used to be hand-set: how much a home
 * side is worth, how far to trust xG over goals, what an above-average shot
 * count says about the next match. They are gathered here as `Params`
 * instead, and `fitLeagueParams` searches for the set that would have called
 * the season best.
 *
 * Learning is a walk forward, not a regression over the finished table: each
 * match is predicted from the accumulated record of the matches BEFORE it and
 * scored on log-loss, then folded in. A parameter set is only as good as the
 * calls it would have made at kickoff, and a fit over the whole season cannot
 * tell you that — it has already seen the answer.
 *
 * DEFAULT_PARAMS reproduces the hand-set model exactly, so a fit that finds
 * nothing changes nothing.
 *
 * No @/ imports: `node lib/learn.test.ts` runs this bare, like lib/barca.ts.
 */

import { scorelineMatrix } from "./poisson.ts"

export type Params = {
  /** Goals added to the home side. */
  homeAdv: number
  /** Attack: share taken from xG, the rest from goals actually scored. */
  xgWeight: number
  /** Goals prevented by the keeper, as a cut of the defensive rate. */
  gpCoef: number
  /** Shot quality: how far above-average volume lifts the goal rate. */
  sotCoef: number
  bcCoef: number
  sibCoef: number
  /** Possession difference, in goals per point of possession. */
  possCoef: number
  /**
   * Pull both sides toward the league's average score. Below 1 the model
   * backs off its own team ratings; this is the calibration knob, and a
   * season of results is what says where it belongs.
   */
  shrink: number
  /**
   * Dixon-Coles correction on the four lowest scorelines, in the usual sign
   * convention. Independent Poisson produces too few 0-0s and 1-1s, which is
   * where these models lose draws, so a fit on real football normally lands
   * on a NEGATIVE rho — that is the one that puts the draws back. 0 is plain
   * Poisson.
   */
  rho: number
}

export const DEFAULT_PARAMS: Params = {
  homeAdv: 0.2,
  xgWeight: 0.6,
  gpCoef: 0.06,
  sotCoef: 0.08,
  bcCoef: 0.06,
  sibCoef: 0.04,
  possCoef: 0.002,
  shrink: 1,
  rho: 0,
}

export type Knob<P> = { key: keyof P & string; lo: number; hi: number; step: number }

/** What each parameter may be, and how far a fitting pass steps through it. */
export const PARAM_KNOBS: Knob<Params>[] = [
  { key: "homeAdv", lo: 0, hi: 0.6, step: 0.08 },
  { key: "xgWeight", lo: 0, hi: 1, step: 0.15 },
  { key: "gpCoef", lo: 0, hi: 0.25, step: 0.04 },
  // Wide enough that a fit settles inside them rather than against them: at
  // ±0.4 and ±0.02 the shot and possession terms both pinned to the ceiling,
  // which says the bound was doing the choosing.
  { key: "sotCoef", lo: -0.4, hi: 0.9, step: 0.08 },
  { key: "bcCoef", lo: -0.4, hi: 0.9, step: 0.08 },
  { key: "sibCoef", lo: -0.4, hi: 0.9, step: 0.08 },
  { key: "possCoef", lo: -0.02, hi: 0.05, step: 0.005 },
  { key: "shrink", lo: 0.4, hi: 1.3, step: 0.1 },
  { key: "rho", lo: -0.2, hi: 0.2, step: 0.04 },
]

/** Readable names, for the card that shows what the model changed its mind about. */
export const PARAM_LABEL: Record<keyof Params, string> = {
  homeAdv: "Home advantage",
  xgWeight: "Trust in xG over goals",
  gpCoef: "Keeper's goals prevented",
  sotCoef: "Shots on target",
  bcCoef: "Big chances",
  sibCoef: "Shots inside the box",
  possCoef: "Possession edge",
  shrink: "Confidence in team ratings",
  rho: "Low-score (draw) correction",
}

// ── Scorelines ──

/**
 * Dixon-Coles tau: nudges the four scorelines where treating the two sides as
 * independent is worst. Every other scoreline is left alone.
 */
function tau(h: number, a: number, lh: number, la: number, rho: number): number {
  if (rho === 0) return 1
  if (h === 0 && a === 0) return Math.max(0, 1 - lh * la * rho)
  if (h === 0 && a === 1) return Math.max(0, 1 + lh * rho)
  if (h === 1 && a === 0) return Math.max(0, 1 + la * rho)
  if (h === 1 && a === 1) return Math.max(0, 1 - rho)
  return 1
}

export type Probs = { homeWin: number; draw: number; awayWin: number }

/** Home win / draw / away win from both sides' expected goals. */
/**
 * Every scoreline's probability, `grid[h][a]`, normalised to sum to 1.
 *
 * The one source of truth for anything read off a scoreline. Win/draw/loss
 * below and every market in lib/markets are summed from the same grid, so
 * they can never disagree with each other.
 */
export function scoreGrid(
  homeExpected: number,
  awayExpected: number,
  rho = 0,
  maxGoals = 7,
): number[][] {
  // The independent-Poisson product comes from lib/poisson.ts, which is where
  // the truncation and the normalisation convention live. This function's own
  // contribution is tau: the four low scorelines where independence is worst.
  // Normalising twice is not a problem — scaling every cell by a constant and
  // then dividing by the new total lands on the same grid — and it means
  // neither module has to know the other skips a step.
  const grid = scorelineMatrix(homeExpected, awayExpected, maxGoals)

  let total = 0
  for (let h = 0; h < grid.length; h++) {
    for (let a = 0; a < grid[h].length; a++) {
      grid[h][a] *= tau(h, a, homeExpected, awayExpected, rho)
      total += grid[h][a]
    }
  }
  if (total > 0) {
    for (const row of grid) {
      for (let a = 0; a < row.length; a++) row[a] /= total
    }
  }
  return grid
}

export function outcomeProbs(
  homeExpected: number,
  awayExpected: number,
  rho = 0,
  maxGoals = 7,
): Probs {
  const grid = scoreGrid(homeExpected, awayExpected, rho, maxGoals)
  let homeWin = 0
  let draw = 0
  let awayWin = 0
  for (let h = 0; h < grid.length; h++) {
    for (let a = 0; a < grid[h].length; a++) {
      const p = grid[h][a]
      if (h > a) homeWin += p
      else if (h === a) draw += p
      else awayWin += p
    }
  }
  return { homeWin, draw, awayWin }
}

// ── Team ratings ──

/** One club's season so far: goal totals, and per-match stat averages. */
export type TeamSeason = {
  played: number
  goalsFor: number
  goalsAgainst: number
  xg: number
  sot: number
  bc: number
  sib: number
  poss: number
  gp: number
}

export type LeagueAvg = { goals: number; sot: number; bc: number; sib: number }

/** Two matches is the least that can say anything; below it a club is unrated. */
export const MIN_RATED_GAMES = 2

const attack = (t: TeamSeason, avgGoals: number, p: Params) => {
  const base = Math.max(avgGoals, 0.5)
  const goals = t.goalsFor / t.played / base
  if (t.xg > 0) return (t.xg / base) * p.xgWeight + goals * (1 - p.xgWeight)
  return goals
}

const defence = (t: TeamSeason, avgGoals: number, p: Params) => {
  const base = t.goalsAgainst / t.played / Math.max(avgGoals, 0.5)
  if (t.gp === 0) return base
  return Math.max(0.4, base - t.gp * p.gpCoef)
}

function shotQuality(t: TeamSeason, avg: LeagueAvg, p: Params): number {
  let mult = 1
  if (t.sot > 0 && avg.sot > 0) mult += (t.sot / avg.sot - 1) * p.sotCoef
  if (t.bc > 0 && avg.bc > 0) mult += (t.bc / avg.bc - 1) * p.bcCoef
  if (t.sib > 0 && avg.sib > 0) mult += (t.sib / avg.sib - 1) * p.sibCoef
  return Math.max(0.75, Math.min(1.3, mult))
}

const isRated = (t: TeamSeason | null): t is TeamSeason => t != null && t.played >= MIN_RATED_GAMES

/**
 * Expected goals for a league match, [home, away].
 *
 * A club with fewer than two games has no usable profile, so the pair falls
 * back to goals for and against alone — the same fallback the hand-set model
 * used, kept so that a fit never silently changes those fixtures.
 */
export function leagueLambdas(
  home: TeamSeason | null,
  away: TeamSeason | null,
  avg: LeagueAvg,
  p: Params,
): [number, number] {
  let homeExpected: number
  let awayExpected: number

  if (isRated(home) && isRated(away)) {
    homeExpected = attack(home, avg.goals, p) * defence(away, avg.goals, p) * avg.goals
    awayExpected = attack(away, avg.goals, p) * defence(home, avg.goals, p) * avg.goals
    homeExpected *= shotQuality(home, avg, p)
    awayExpected *= shotQuality(away, avg, p)

    if (home.poss > 0 && away.poss > 0) {
      const adj = (home.poss - away.poss) * p.possCoef
      homeExpected += adj
      awayExpected -= adj * 0.5
    }
  } else {
    const rate = (t: TeamSeason | null, key: "goalsFor" | "goalsAgainst") =>
      isRated(t) ? t[key] / t.played / avg.goals : 1
    homeExpected = rate(home, "goalsFor") * rate(away, "goalsAgainst") * avg.goals
    awayExpected = rate(away, "goalsFor") * rate(home, "goalsAgainst") * avg.goals
  }

  // Back off toward a typical scoreline before the home bump, which belongs
  // to the fixture rather than to either side's rating.
  homeExpected = avg.goals + (homeExpected - avg.goals) * p.shrink
  awayExpected = avg.goals + (awayExpected - avg.goals) * p.shrink
  homeExpected += p.homeAdv

  return [Math.max(0.3, homeExpected), Math.max(0.3, awayExpected)]
}

// ── Walking the season forward ──

export type StatLine = {
  xg?: number
  sot?: number
  bc?: number
  sib?: number
  poss?: number
  gp?: number
}

export type LearnMatch = {
  event_id: number
  season: string
  league: string
  date: string
  home: string
  away: string
  homeGoals: number
  awayGoals: number
  homeStats?: StatLine
  awayStats?: StatLine
}

type Tally = {
  n: number
  gf: number
  ga: number
  xg: number
  sot: number
  bc: number
  sib: number
  poss: number
  gp: number
}

const STAT_KEYS = ["xg", "sot", "bc", "sib", "poss", "gp"] as const

/**
 * The record of a season as it builds, match by match.
 *
 * Keyed by season as well as league: form does not carry across the summer,
 * and the live model rates every club on the current season alone.
 */
export class Ledger {
  private teams = new Map<string, Tally>()
  private leagues = new Map<string, Set<string>>()

  private key = (m: { season: string; league: string }, team: string) =>
    `${m.season}|${m.league}|${team}`

  /** A club's season so far, or null if it has not played in this one. */
  team(m: { season: string; league: string }, name: string): TeamSeason | null {
    const t = this.teams.get(this.key(m, name))
    if (!t || t.n === 0) return null
    return {
      played: t.n,
      goalsFor: t.gf,
      goalsAgainst: t.ga,
      xg: t.xg / t.n,
      sot: t.sot / t.n,
      bc: t.bc / t.n,
      sib: t.sib / t.n,
      poss: t.poss / t.n,
      gp: t.gp / t.n,
    }
  }

  /**
   * The league's averages so far, over the clubs with a usable record — the
   * same cohort the ratings are measured against.
   */
  avg(m: { season: string; league: string }): LeagueAvg {
    const names = this.leagues.get(`${m.season}|${m.league}`)
    let games = 0
    let goals = 0
    let sot = 0
    let bc = 0
    let sib = 0
    let rated = 0
    for (const name of names ?? []) {
      const t = this.teams.get(this.key(m, name))
      if (!t || t.n < MIN_RATED_GAMES) continue
      games += t.n
      goals += t.gf
      rated++
      sot += t.sot / t.n
      bc += t.bc / t.n
      sib += t.sib / t.n
    }
    if (!rated) return { goals: 1.3, sot: 4, bc: 1, sib: 5 }
    return { goals: goals / games || 1.2, sot: sot / rated, bc: bc / rated, sib: sib / rated }
  }

  /** Fold a played match in. Call only after it has been predicted. */
  add(m: LearnMatch) {
    const sides: [string, number, number, StatLine | undefined][] = [
      [m.home, m.homeGoals, m.awayGoals, m.homeStats],
      [m.away, m.awayGoals, m.homeGoals, m.awayStats],
    ]
    const league = this.leagues.get(`${m.season}|${m.league}`) ?? new Set<string>()
    this.leagues.set(`${m.season}|${m.league}`, league)
    for (const [team, gf, ga, stats] of sides) {
      league.add(team)
      const k = this.key(m, team)
      const t = this.teams.get(k) ?? {
        n: 0, gf: 0, ga: 0, xg: 0, sot: 0, bc: 0, sib: 0, poss: 0, gp: 0,
      }
      t.n++
      t.gf += gf
      t.ga += ga
      for (const key of STAT_KEYS) t[key] += stats?.[key] ?? 0
      this.teams.set(k, t)
    }
  }
}

export type Score = {
  /** Matches scored: those where both sides already had a record. */
  n: number
  /** Mean negative log-likelihood of the true result. Lower is better. */
  logLoss: number
  /** Mean squared error across the three outcomes. */
  brier: number
  /** Share of results whose most likely outcome came in. */
  hitRate: number
}

/** What saying a third each every time scores. Beating it is the bar. */
export const COIN_FLIP_LOSS = Math.log(3)

const UNSCORED: Score = { n: 0, logLoss: COIN_FLIP_LOSS, brier: 2 / 3, hitRate: 0 }

const resultKey = (m: LearnMatch): keyof Probs =>
  m.homeGoals > m.awayGoals ? "homeWin" : m.homeGoals < m.awayGoals ? "awayWin" : "draw"

/**
 * Replay matches in order, predicting each from the record before it.
 *
 * `scoreSeason` and `scoreFrom` limit what counts toward the score without
 * limiting what is learnt from, which is how a fit gets marked on matches it
 * was never trained on: another season, or the back half of this one. Dates
 * are YYYY-MM-DD, so comparing them as strings orders them correctly.
 * Matches must already be in date order.
 */
export function walkForward(
  matches: LearnMatch[],
  params: Params,
  scoreSeason?: string,
  scoreFrom?: string,
): Score {
  const ledger = new Ledger()
  let n = 0
  let logLoss = 0
  let brier = 0
  let hits = 0

  for (const m of matches) {
    if ((!scoreSeason || m.season === scoreSeason) && (!scoreFrom || m.date >= scoreFrom)) {
      const home = ledger.team(m, m.home)
      const away = ledger.team(m, m.away)
      // Both sides need a record, or the match is only measuring the fallback.
      if (isRated(home) && isRated(away)) {
        const [lh, la] = leagueLambdas(home, away, ledger.avg(m), params)
        const p = outcomeProbs(lh, la, params.rho)
        const key = resultKey(m)
        n++
        logLoss += -Math.log(Math.max(p[key], 1e-9))
        for (const o of ["homeWin", "draw", "awayWin"] as const) {
          brier += (p[o] - (o === key ? 1 : 0)) ** 2
        }
        const best =
          p.homeWin >= p.draw && p.homeWin >= p.awayWin
            ? "homeWin"
            : p.awayWin >= p.draw
              ? "awayWin"
              : "draw"
        if (best === key) hits++
      }
    }
    ledger.add(m)
  }

  if (n === 0) return UNSCORED
  return { n, logLoss: logLoss / n, brier: brier / n, hitRate: hits / n }
}

// ── Fitting ──

export type Fit<P> = { params: P; loss: number; evals: number }

/**
 * Coordinate descent: walk each parameter in turn, keep what helps, halve the
 * step and go round again.
 *
 * Deliberately not a gradient method — the loss is a walk-forward replay with
 * clamps and floors in it, so it is not smooth, and with nine parameters a few
 * hundred replays is cheaper than anything cleverer. Deterministic: the same
 * matches always produce the same fit.
 */
export function coordinateFit<P extends Record<string, number>>(
  start: P,
  knobs: Knob<P>[],
  loss: (p: P) => number,
  passes = 4,
): Fit<P> {
  let best = { ...start }
  let bestLoss = loss(best)
  let evals = 1

  for (let pass = 0; pass < passes; pass++) {
    const scale = 1 / 2 ** pass
    let moved = false
    for (const knob of knobs) {
      const step = knob.step * scale
      for (const delta of [step, -step, step * 2, -step * 2]) {
        const value = Math.min(knob.hi, Math.max(knob.lo, best[knob.key] + delta))
        if (value === best[knob.key]) continue
        const candidate = { ...best, [knob.key]: value } as P
        const score = loss(candidate)
        evals++
        if (score < bestLoss - 1e-9) {
          best = candidate
          bestLoss = score
          moved = true
        }
      }
    }
    // Settled: nothing wanted to move at this step size, and the next pass
    // only halves it.
    if (!moved && pass > 0) break
  }

  return { params: best, loss: bestLoss, evals }
}

/** Fit the league model to a run of matches, scoring point in time throughout. */
export function fitLeagueParams(
  matches: LearnMatch[],
  start: Params = DEFAULT_PARAMS,
): Fit<Params> {
  return coordinateFit(start, PARAM_KNOBS, (p) => walkForward(matches, p).logLoss)
}

// ── Learning day to day ──

/** The verdict on a day's refit: what it was judged on, and whether it won. */
export type Gate = {
  /** Start of the held-out run; matches from here on were kept out of the fit. */
  from: string
  /** How many matches the verdict rests on. */
  n: number
  /** Mean log-loss of the parameters currently live, over those matches. */
  incumbent: number
  /** Mean log-loss of the refit, over the identical matches. */
  candidate: number
  accepted: boolean
}

export type DailyFit = { params: Params; gate: Gate | null }

/**
 * One day's learning: refit from where the live parameters left off, and keep
 * the result only if it would have called the recent past better than they did.
 *
 * The reward is log-loss, which pays for probability on the result that came
 * in and charges for the rest — a plain "was the pick right" would score a
 * lucky 51% call the same as a confident 85% one, and the whole point of the
 * shrink and rho parameters is how sure to be, not who to pick.
 *
 * The last `holdoutDays` of football is kept out of the fit entirely, so the
 * comparison is between two sets of parameters on matches NEITHER has seen.
 * Scoring a refit on the matches it just learnt from would accept every
 * candidate: more parameters fitted to more data always looks better in
 * sample. The incumbent is scored over exactly the same matches.
 *
 * A tie keeps the incumbent. Churning live parameters for no measured gain is
 * how a model drifts while looking like it is learning.
 *
 * Starting from `incumbent` rather than DEFAULT_PARAMS is what makes this a
 * walk: a day of new results nudges the parameters instead of relocating them.
 * When there is too little football to judge on — early season, a winter break
 * — there is no verdict to give, and it fits on everything and says so with a
 * null gate.
 */
export function dailyFit(
  matches: LearnMatch[],
  incumbent: Params,
  opts: {
    /** Limit scoring to one season, as `walkForward` does. */
    season?: string
    holdoutDays?: number
    /** Below this many matches to learn from, nothing is fitted at all. */
    minTrain?: number
    /** Below this many matches to judge on, no verdict is given. */
    minHoldout?: number
  } = {},
): DailyFit {
  const { season, holdoutDays = 21, minTrain = 200, minHoldout = 30 } = opts
  if (matches.length < minTrain) return { params: incumbent, gate: null }

  // Measured back from the last match rather than from today, so a stale
  // database or an off-season still gets judged on real football.
  const latest = matches[matches.length - 1].date
  const cutoff = new Date(Date.parse(latest) - holdoutDays * 864e5).toISOString().slice(0, 10)
  const learnFrom = matches.filter((m) => m.date < cutoff)
  if (learnFrom.length < minTrain) {
    return { params: fitLeagueParams(matches, incumbent).params, gate: null }
  }

  const candidate = fitLeagueParams(learnFrom, incumbent).params
  const held = walkForward(matches, candidate, season, cutoff)
  const was = walkForward(matches, incumbent, season, cutoff)
  if (held.n < minHoldout) {
    return { params: fitLeagueParams(matches, incumbent).params, gate: null }
  }

  const accepted = held.logLoss < was.logLoss - 1e-9
  return {
    // Refit on everything once the candidate has earnt it: strictly more data
    // than the gated fit saw, started from the parameters that passed.
    params: accepted ? fitLeagueParams(matches, candidate).params : incumbent,
    gate: { from: cutoff, n: held.n, incumbent: was.logLoss, candidate: held.logLoss, accepted },
  }
}
