/** Self-check for the learnt prediction model: `node lib/learn.test.ts` */
import assert from "node:assert/strict"
import { matchProbabilities } from "./poisson.ts"
import {
  outcomeProbs,
  leagueLambdas,
  coordinateFit,
  fitLeagueParams,
  walkForward,
  Ledger,
  DEFAULT_PARAMS,
  PARAM_KNOBS,
  PARAM_LABEL,
  type LearnMatch,
  type Params,
  type TeamSeason,
} from "./learn.ts"

const team = (over: Partial<TeamSeason> = {}): TeamSeason => ({
  played: 10, goalsFor: 18, goalsAgainst: 9,
  xg: 1.7, sot: 5.5, bc: 2.1, sib: 8, poss: 56, gp: 0.2,
  ...over,
})

const AVG = { goals: 1.35, sot: 4.4, bc: 1.6, sib: 6.9 }

// ── The refactor changes nothing at the hand-set defaults ──

// rho = 0 is exactly the plain Poisson the rest of the site shares.
for (const [lh, la] of [[1.8, 0.9], [0.4, 2.6], [1.3, 1.3]]) {
  const mine = outcomeProbs(lh, la, 0)
  const theirs = matchProbabilities(lh, la)
  for (const k of ["homeWin", "draw", "awayWin"] as const) {
    assert.ok(Math.abs(mine[k] - theirs[k]) < 1e-12, `${k} ${mine[k]} vs ${theirs[k]}`)
  }
}

/** The model exactly as it was written by hand, to catch any drift. */
function handSet(h: TeamSeason, a: TeamSeason, avg: typeof AVG): [number, number] {
  const base = Math.max(avg.goals, 0.5)
  const atk = (t: TeamSeason) =>
    t.xg > 0 ? (t.xg / base) * 0.6 + (t.goalsFor / t.played / base) * 0.4 : t.goalsFor / t.played / base
  const def = (t: TeamSeason) => {
    const b = t.goalsAgainst / t.played / base
    return t.gp !== 0 ? Math.max(0.4, b - t.gp * 0.06) : b
  }
  const shot = (t: TeamSeason) => {
    let mult = 1
    if (t.sot > 0 && avg.sot > 0) mult += (t.sot / avg.sot - 1) * 0.08
    if (t.bc > 0 && avg.bc > 0) mult += (t.bc / avg.bc - 1) * 0.06
    if (t.sib > 0 && avg.sib > 0) mult += (t.sib / avg.sib - 1) * 0.04
    return Math.max(0.75, Math.min(1.3, mult))
  }
  let home = atk(h) * def(a) * avg.goals * shot(h)
  let away = atk(a) * def(h) * avg.goals * shot(a)
  const adj = h.poss > 0 && a.poss > 0 ? (h.poss - a.poss) * 0.002 : 0
  home += adj
  away -= adj * 0.5
  home += 0.2
  return [Math.max(0.3, home), Math.max(0.3, away)]
}

for (const pair of [
  [team(), team({ goalsFor: 8, goalsAgainst: 20, xg: 0.9, sot: 3, bc: 0.8, sib: 4, poss: 41, gp: -0.3 })],
  [team({ xg: 0 }), team({ xg: 0, gp: 0 })],
  [team({ poss: 0 }), team()],
] as [TeamSeason, TeamSeason][]) {
  const got = leagueLambdas(pair[0], pair[1], AVG, DEFAULT_PARAMS)
  const want = handSet(pair[0], pair[1], AVG)
  assert.ok(
    Math.abs(got[0] - want[0]) < 1e-12 && Math.abs(got[1] - want[1]) < 1e-12,
    `defaults drifted: ${got} vs ${want}`,
  )
}

// An unrated side drops to the goals-only fallback: the rated side keeps its
// own scoring and conceding rates, the unrated one counts as exactly average.
const cold = leagueLambdas(null, team(), AVG, DEFAULT_PARAMS)
assert.ok(Math.abs(cold[0] - (team().goalsAgainst / 10 + 0.2)) < 1e-12, `home ${cold[0]}`)
assert.ok(Math.abs(cold[1] - team().goalsFor / 10) < 1e-12, `away ${cold[1]}`)
assert.deepEqual(leagueLambdas(null, null, AVG, DEFAULT_PARAMS), [AVG.goals + 0.2, AVG.goals])

// ── The new knobs do what they claim ──

// Negative rho buys draws (the Dixon-Coles sign convention), positive sells
// them, and either way the three outcomes still account for everything.
const plain = outcomeProbs(1.4, 1.2, 0)
const drawish = outcomeProbs(1.4, 1.2, -0.12)
const winnish = outcomeProbs(1.4, 1.2, 0.12)
assert.ok(drawish.draw > plain.draw, `${drawish.draw} vs ${plain.draw}`)
assert.ok(winnish.draw < plain.draw, `${winnish.draw} vs ${plain.draw}`)
for (const p of [plain, drawish, winnish]) {
  assert.ok(Math.abs(p.homeWin + p.draw + p.awayWin - 1) < 1e-12)
}

// Shrink pulls a lopsided fixture back toward a typical scoreline.
const strong = team({ goalsFor: 30, goalsAgainst: 4, xg: 2.6 })
const weak = team({ goalsFor: 5, goalsAgainst: 24, xg: 0.7 })
const bold = leagueLambdas(strong, weak, AVG, DEFAULT_PARAMS)
const shy = leagueLambdas(strong, weak, AVG, { ...DEFAULT_PARAMS, shrink: 0.6 })
assert.ok(shy[0] < bold[0] && shy[1] > bold[1], "shrink should close the gap")
assert.deepEqual(leagueLambdas(strong, weak, AVG, { ...DEFAULT_PARAMS, shrink: 1 }), bold)

// Every parameter has a knob that contains its starting value, and a label.
for (const k of Object.keys(DEFAULT_PARAMS) as (keyof Params)[]) {
  const knob = PARAM_KNOBS.find((n) => n.key === k)
  assert.ok(knob, `${k} has no knob`)
  assert.ok(DEFAULT_PARAMS[k] >= knob!.lo && DEFAULT_PARAMS[k] <= knob!.hi, `${k} starts out of bounds`)
  assert.ok(PARAM_LABEL[k], `${k} has no label`)
}

// ── The ledger never sees the future ──

const m = (id: number, date: string, home: string, away: string, hg: number, ag: number): LearnMatch => ({
  event_id: id, season: "S1", league: "L", date, home, away, homeGoals: hg, awayGoals: ag,
  homeStats: { xg: hg + 0.3, sot: 5, bc: 2, sib: 7, poss: 55, gp: 0 },
  awayStats: { xg: ag + 0.3, sot: 4, bc: 1, sib: 6, poss: 45, gp: 0 },
})

const led = new Ledger()
const key = { season: "S1", league: "L" }
assert.equal(led.team(key, "A"), null)
led.add(m(1, "2026-08-01", "A", "B", 3, 0))
assert.deepEqual(
  [led.team(key, "A")!.played, led.team(key, "A")!.goalsFor, led.team(key, "A")!.goalsAgainst],
  [1, 3, 0],
)
led.add(m(2, "2026-08-08", "C", "A", 1, 1))
assert.deepEqual([led.team(key, "A")!.played, led.team(key, "A")!.goalsFor], [2, 4])
// Another season is a different record entirely.
assert.equal(led.team({ season: "S2", league: "L" }, "A"), null)

// ── Walking forward ──

const season: LearnMatch[] = []
const clubs = ["A", "B", "C", "D"]
let id = 0
for (let round = 0; round < 12; round++) {
  for (let i = 0; i < 2; i++) {
    const home = clubs[(round + i) % 4]
    const away = clubs[(round + i + 1 + (i % 2)) % 4]
    if (home === away) continue
    season.push(m(++id, `2026-09-${String(round + 1).padStart(2, "0")}`, home, away, (round + i) % 3, i))
  }
}
const walked = walkForward(season, DEFAULT_PARAMS)
// The opening matches have no record behind them, so they cannot be scored.
assert.ok(walked.n > 0 && walked.n < season.length)
assert.ok(walked.logLoss > 0 && Number.isFinite(walked.logLoss))
assert.ok(walked.hitRate >= 0 && walked.hitRate <= 1)
assert.ok(walked.brier >= 0 && walked.brier <= 2)
// Scoring one season only still learns from the other.
const twoSeasons = [...season, ...season.map((x) => ({ ...x, season: "S2", event_id: x.event_id + 1000 }))]
assert.equal(walkForward(twoSeasons, DEFAULT_PARAMS, "S2").n, walked.n)
assert.equal(walkForward([], DEFAULT_PARAMS).n, 0)

// A date holds out the back of a season without hiding it from the ledger:
// fewer matches scored, and none of them before the cut.
const held = walkForward(season, DEFAULT_PARAMS, undefined, "2026-09-07")
assert.ok(held.n > 0 && held.n < walked.n, `${held.n} vs ${walked.n}`)
assert.equal(walkForward(season, DEFAULT_PARAMS, undefined, "2026-09-01").n, walked.n)
assert.equal(walkForward(season, DEFAULT_PARAMS, undefined, "2099-01-01").n, 0)

// ── The fitter ──

// Finds the floor of a simple bowl, within a step of the truth.
const bowl = coordinateFit(
  { x: 0, y: 0 },
  [{ key: "x", lo: -5, hi: 5, step: 0.5 }, { key: "y", lo: -5, hi: 5, step: 0.5 }],
  (p) => (p.x - 2.25) ** 2 + (p.y + 1.5) ** 2,
  6,
)
assert.ok(Math.abs(bowl.params.x - 2.25) < 0.3 && Math.abs(bowl.params.y + 1.5) < 0.3, JSON.stringify(bowl))
assert.ok(bowl.evals > 1)
// It never returns something worse than where it started.
assert.deepEqual(coordinateFit({ x: 1 }, [{ key: "x", lo: 0, hi: 2, step: 0.1 }], () => 7).params, { x: 1 })

// On a league built with a bigger home edge than the default, the fit finds it.
let seed = 42
const rand = () => {
  seed = (seed + 0x6d2b79f5) >>> 0
  let t = seed
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const draw = (lambda: number) => {
  const limit = Math.exp(-lambda)
  let k = 0
  let p = 1
  do { k++; p *= rand() } while (p > limit)
  return k - 1
}
const TRUE_HOME_ADV = 0.45
const strength = new Map(["A", "B", "C", "D", "E", "F"].map((t, i) => [t, 0.8 + i * 0.16]))
const names = [...strength.keys()]
const generated: LearnMatch[] = []
let gid = 0
for (let round = 0; round < 70; round++) {
  for (let i = 0; i < names.length; i += 2) {
    const home = names[(round + i) % names.length]
    const away = names[(round + i + 3) % names.length]
    if (home === away) continue
    const lh = (strength.get(home)! / strength.get(away)!) * 1.3 + TRUE_HOME_ADV
    const la = (strength.get(away)! / strength.get(home)!) * 1.3
    // No stat lines: this exercises the goals-only path and the home bump.
    generated.push({
      event_id: ++gid, season: "G", league: "L",
      date: `2026-${String(1 + (round % 9)).padStart(2, "0")}-${String(1 + (i % 28)).padStart(2, "0")}`,
      home, away, homeGoals: draw(lh), awayGoals: draw(la),
    })
  }
}
const before = walkForward(generated, DEFAULT_PARAMS).logLoss
const fitted = fitLeagueParams(generated)
assert.ok(fitted.loss < before, `fit did not improve: ${fitted.loss} vs ${before}`)
assert.ok(
  fitted.params.homeAdv > DEFAULT_PARAMS.homeAdv,
  `home advantage should have risen toward ${TRUE_HOME_ADV}, got ${fitted.params.homeAdv}`,
)
// Fitting is deterministic: same matches, same answer.
assert.deepEqual(fitLeagueParams(generated).params, fitted.params)

console.log(
  `learn ok · synthetic log-loss ${before.toFixed(4)} -> ${fitted.loss.toFixed(4)}, ` +
    `homeAdv ${DEFAULT_PARAMS.homeAdv} -> ${fitted.params.homeAdv.toFixed(2)} (true ${TRUE_HOME_ADV})`,
)
