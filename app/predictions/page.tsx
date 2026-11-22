import { Suspense } from "react"
import { Reveal } from "@/components/reveal"
import { cacheLife } from "next/cache"
import Link from "next/link"
import { supabase, fetchAllRows } from "@/lib/supabase"
import { resolveSeason } from "@/lib/seasons"
import {
  fetchTeamData,
  LEAGUE_ABBR,
  LEAGUE_TOURNAMENT_ID,
  POWER_COLORS,
  LEAGUE_FILTERS,
} from "@/lib/teams"
import {
  predictMatches,
  computeAccuracy,
  uclStrengths,
  PREDICTION_STATS,
  type MatchPrediction,
  type AccuracyStats,
  type UclModel,
  type UclStrength,
} from "@/lib/predictions"
import { withFrozenPredictions } from "@/lib/predictions-freeze"
import { UCL } from "@/lib/competition"
import { Skeleton } from "@/components/ui/skeleton"
import { TeamCrest, LeagueCrest } from "@/components/player-avatar"
import { PredictionsLeagueToggle } from "@/components/predictions-league-toggle"
import { TeamRankingsExpand } from "@/components/team-rankings-expand"
import { PredictionMatchCard } from "@/components/prediction-match-card"
import { calibration, type Calibration } from "@/lib/calibration"
import { formatDateIST } from "@/lib/time"
import { loadModelFit, skillOf, type ModelFit } from "@/lib/fitted-model"
import { DEFAULT_PARAMS, PARAM_LABEL, scoreGrid, type Params } from "@/lib/learn"
import { marketsFor, safestLeg, safestDouble, likeliestScore, scorerChance } from "@/lib/markets"
import type { BestBet } from "@/components/best-bet"

const OUTCOME_COLORS = {
  home: "oklch(0.80 0.19 150)",
  draw: "oklch(0.70 0.045 252)",
  away: "oklch(0.72 0.14 40)",
} as const

const OUTCOME_LABELS = { home: "Home", draw: "Draw", away: "Away" } as const



function AccuracyCard({ acc, cal }: { acc: AccuracyStats; cal: Calibration }) {
  if (acc.total === 0) return null
  const ring = (correct: number, total: number) => {
    const pct = total > 0 ? (correct / total) * 100 : 0
    const r = 18
    const circ = 2 * Math.PI * r
    const offset = circ - (pct / 100) * circ
    return { pct: Math.round(pct), r, circ, offset }
  }

  const overall = ring(acc.correct, acc.total)

  return (
    <section className="surface rounded-2xl bg-card p-5">
      <header className="flex items-baseline justify-between pb-4">
        <h2
          className="text-lg font-semibold tracking-tight uppercase"
          style={{ fontFamily: "var(--font-condensed)" }}
        >
          Accuracy Tracker
        </h2>
        <span className="stat-label">{acc.total} settled</span>
      </header>

      <div className="flex items-center gap-6">
        <div className="relative shrink-0">
          <svg width="52" height="52" viewBox="0 0 44 44" className="-rotate-90">
            <circle cx="22" cy="22" r={overall.r} fill="none" stroke="oklch(1 0 0 / 8%)" strokeWidth="5" />
            <circle
              cx="22" cy="22" r={overall.r} fill="none"
              stroke={OUTCOME_COLORS.home}
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={overall.circ}
              strokeDashoffset={overall.offset}
            />
          </svg>
          <span
            className="absolute inset-0 flex items-center justify-center stat-figure text-sm"
            style={{ color: OUTCOME_COLORS.home }}
          >
            {overall.pct}%
          </span>
        </div>

        <div className="flex-1 grid grid-cols-3 gap-3">
          {([
            { label: "Home", correct: acc.homeCorrect, total: acc.homeTotal, color: OUTCOME_COLORS.home },
            { label: "Draw", correct: acc.drawCorrect, total: acc.drawTotal, color: OUTCOME_COLORS.draw },
            { label: "Away", correct: acc.awayCorrect, total: acc.awayTotal, color: OUTCOME_COLORS.away },
          ] as const).map((s) => (
            <div key={s.label} className="text-center">
              <div className="stat-label">{s.label}</div>
              <div className="stat-figure text-lg" style={{ color: s.color }}>
                {s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0}%
              </div>
              <div className="stat-label">{s.correct}/{s.total}</div>
            </div>
          ))}
        </div>
      </div>

      {cal.count >= 20 && (
        <div className="mt-5 pt-4 border-t border-white/5">
          <div className="flex items-baseline justify-between gap-3 pb-3">
            <h3 className="stat-label">Is it honest about confidence?</h3>
            <span
              className="stat-label"
              title={`Brier score ${cal.brier} against ${cal.coinFlip} for always saying a third each. Lower is better.`}
            >
              {cal.skill > 0 ? `${cal.skill}% better than a coin flip` : "no better than a coin flip"}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {cal.buckets.filter((b) => b.count > 0).map((b) => (
              <div key={b.label}>
                <div className="flex items-baseline justify-between">
                  <span className="stat-label">said {b.label}</span>
                  <span className="stat-label">{b.count}</span>
                </div>
                <div className="relative h-[10px] mt-1.5 rounded-full bg-black/5 dark:bg-white/[0.05]">
                  <span
                    className="bar-grow absolute inset-y-0 left-0 rounded-full"
                    style={{ width: `${b.hit}%`, background: OUTCOME_COLORS.home, opacity: 0.85 }}
                  />
                  {/* Where the bar would end if the model were perfectly calibrated. */}
                  <span
                    className="absolute -inset-y-0.5 w-[2px] rounded-full bg-foreground/70"
                    style={{ left: `${b.said}%` }}
                    title={`Said ${b.said}% on average`}
                  />
                </div>
                <div className="stat-figure text-sm mt-1.5">
                  right {b.hit}%
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground/70 mt-3">
            The tick is how sure the model said it was; the bar is how often it was right.
            Bar past the tick means it undersold itself, short of it means overconfident.
          </p>
        </div>
      )}
    </section>
  )
}

/** 0.37 reads better than 0.3700; 0.030 would otherwise round away to 0.03. */
const fmtParam = (v: number) => (Math.abs(v) >= 0.1 ? v.toFixed(2) : v.toFixed(3))

/**
 * What the model taught itself.
 *
 * The headline is the honest one: parameters fitted on last season only, then
 * marked on this season's results, which they never saw, against the settings
 * that used to be chosen by hand.
 */
function LearntCard({ fit }: { fit: ModelFit }) {
  if (fit.trained === 0) return null
  const moved = (Object.keys(DEFAULT_PARAMS) as (keyof Params)[])
    .map((k) => ({ key: k, from: DEFAULT_PARAMS[k], to: fit.params[k] }))
    .filter((p) => Math.abs(p.to - p.from) > 1e-9)

  const t = fit.tested
  const better = t ? skillOf(t.learnt.logLoss) - skillOf(t.handSet.logLoss) : 0

  return (
    <section className="surface rounded-2xl bg-card p-5">
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 pb-4">
        <h2
          className="text-lg font-semibold tracking-tight uppercase"
          style={{ fontFamily: "var(--font-condensed)" }}
        >
          What the model has learnt
        </h2>
        <span className="stat-label">
          {fit.trained.toLocaleString()} matches · {fit.seasons.join(" + ")}
        </span>
      </header>

      {t ? (
        <>
          <p className="text-sm mb-4">
            <span className="stat-figure text-2xl mr-2" style={{ color: OUTCOME_COLORS.home }}>
              {better > 0 ? "+" : ""}
              {better.toFixed(1)}%
            </span>
            <span className="text-muted-foreground">
              more skill than the settings we picked by hand, over {t.learnt.n} matches of{" "}
              {t.season} that the learnt ones never saw.
            </span>
          </p>
          <div className="grid grid-cols-3 gap-3 mb-5">
            {([
              ["Log-loss", t.handSet.logLoss, t.learnt.logLoss, 3, "lower"],
              ["Brier", t.handSet.brier, t.learnt.brier, 3, "lower"],
              ["Called right", t.handSet.hitRate * 100, t.learnt.hitRate * 100, 1, "higher"],
            ] as const).map(([label, was, now, digits, good]) => {
              const improved = good === "lower" ? now < was : now > was
              return (
                <div key={label}>
                  <div className="stat-label">{label}</div>
                  <div
                    className="stat-figure text-lg"
                    style={{ color: improved ? OUTCOME_COLORS.home : undefined }}
                  >
                    {now.toFixed(digits)}
                    {label === "Called right" && "%"}
                  </div>
                  <div className="stat-label">
                    was {was.toFixed(digits)}
                    {label === "Called right" && "%"}
                  </div>
                </div>
              )
            })}
          </div>
          <p className="text-xs text-muted-foreground/70 mb-5">
            It picks barely any more winners. What it gained is honesty about how sure it
            is — which is most of what a prediction is worth.
          </p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground mb-5">
          Fitted on every finished league match. There is no earlier season here to mark it
          against yet.
        </p>
      )}

      {moved.length > 0 && (
        <>
          <h3 className="stat-label mb-2">It changed its mind about</h3>
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5">
            {moved.map((p) => (
              <div key={p.key} className="flex items-baseline gap-3 text-sm">
                <span className="flex-1 min-w-0 truncate text-muted-foreground">
                  {PARAM_LABEL[p.key]}
                </span>
                <span className="stat-figure text-sm tabular-nums text-muted-foreground/60">
                  {fmtParam(p.from)}
                </span>
                <span className="text-muted-foreground/40 text-xs">to</span>
                <span className="stat-figure text-sm tabular-nums w-12 text-right">
                  {fmtParam(p.to)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
      <p className="text-xs text-muted-foreground/70 mt-4">
        Every finished match is replayed in order and predicted from only what was known
        before it kicked off; the settings that would have called the season best are the
        ones used from here. Results land twice a day and it fits again. The Champions
        League keeps its own model.
      </p>
    </section>
  )
}

const WANTED_STATS = PREDICTION_STATS

/** Markets shown beside the pick, for context. */
const CONTEXT_MARKETS = ["o2.5", "btts", "1X"]

type Scorer = { player: string; slug: string; team: string; goals: number }

/**
 * Each club's leading scorer, and the club's goal total to measure their
 * share against.
 *
 * Filtering to three goals or more is a few hundred rows rather than the
 * couple of thousand a full squad read costs, and nobody below that leads a
 * club anyway.
 */
async function loadTopScorers(season: string) {
  "use cache"
  cacheLife("hours")

  const { data } = await supabase
    .from("players")
    .select("player, slug, team, goals")
    .eq("season", season)
    .gte("goals", 3)
    .order("goals", { ascending: false })

  const best = new Map<string, Scorer>()
  const teamGoals = new Map<string, number>()
  for (const r of (data ?? []) as Scorer[]) {
    const goals = Number(r.goals) || 0
    teamGoals.set(r.team, (teamGoals.get(r.team) ?? 0) + goals)
    // Rows arrive highest first, so the first seen per club leads it.
    if (!best.has(r.team)) best.set(r.team, { ...r, goals })
  }
  return { best, teamGoals }
}

/**
 * What the model says about a fixture's markets.
 *
 * Everything comes off one scoreline grid, the same one behind the win/draw/
 * loss split, so a market can never contradict the headline probabilities.
 */
function bestBetFor(
  p: MatchPrediction,
  rho: number,
  scorers: Awaited<ReturnType<typeof loadTopScorers>>,
): BestBet {
  const grid = scoreGrid(p.homeExpected, p.awayExpected, rho)
  const legs = marketsFor(grid, p.home, p.away)
  const top = safestLeg(legs)
  const double = safestDouble(grid, legs)

  // Whichever club's leading scorer is likelier to get on the scoresheet.
  let scorer: BestBet["scorer"] = null
  for (const [team, expected] of [
    [p.home, p.homeExpected],
    [p.away, p.awayExpected],
  ] as const) {
    const s = scorers.best.get(team)
    if (!s) continue
    const prob = scorerChance(s.goals, scorers.teamGoals.get(team) ?? 0, expected)
    if (prob > 0 && (!scorer || prob > scorer.prob)) {
      scorer = { player: s.player, slug: s.slug, team, prob }
    }
  }

  return {
    top: top && { label: top.label, prob: top.prob },
    double: double && {
      labels: [double.legs[0].label, double.legs[1].label],
      prob: double.prob,
    },
    markets: CONTEXT_MARKETS.map((k) => legs.find((l) => l.key === k))
      .filter((l) => l != null)
      .map((l) => ({ label: l.label, prob: l.prob })),
    scorer,
    score: likeliestScore(grid),
  }
}

function signed(n: number, digits = 2) {
  return `${n > 0 ? "+" : ""}${n.toFixed(digits)}`
}

/**
 * Every Champions League club rated by the same model that sets the odds, so
 * a reader can see why a match is priced the way it is. Top five in the card
 * and the rest behind the expander — the same shape as the teams tab's Power
 * Rankings, because all 36 in one grid read as a wall rather than a ranking.
 */
function UclRatings({ model, ids }: { model: UclModel; ids: Map<string, number> }) {
  const rows = [...model.teams.values()].sort((a, b) => b.rating - a.rating)
  if (rows.length === 0) return null
  const top = Math.max(...rows.map((r) => Math.abs(r.rating)), 0.01)
  const five = rows.slice(0, 5)

  /** What the rating rests on — a club rated on two games is worth less trust. */
  const basis = (t: UclStrength) =>
    `${t.uclPlayed} UCL${
      t.domesticLeague
        ? ` · ${t.domesticPlayed} ${LEAGUE_ABBR[t.domesticLeague] ?? t.domesticLeague}`
        : ""
    }`
  // Podium tint down the top five, but never green on a negative margin.
  const tone = (rating: number, i?: number) =>
    rating < 0 ? OUTCOME_COLORS.away : i == null ? "var(--pitch)" : POWER_COLORS[i]

  return (
    <section className="surface rounded-2xl bg-card overflow-hidden">
      <header className="px-5 pt-5 pb-4">
        <div className="flex items-center gap-2">
          <h2
            className="text-lg font-semibold tracking-tight uppercase"
            style={{ fontFamily: "var(--font-condensed)" }}
          >
            UCL strength
          </h2>
          {rows.length > five.length && (
            <TeamRankingsExpand
              title="UCL strength"
              subtitle={`${rows.length} clubs · expected goal margin vs an average side`}
              teamIds={ids}
              rows={rows.map((t) => ({
                team: t.team,
                league: UCL,
                rating: signed(t.rating),
                ratingTone: tone(t.rating),
                meta: basis(t),
                cols: [
                  { value: (t.attack * model.avg).toFixed(2), label: "for" },
                  { value: (t.defence * model.avg).toFixed(2), label: "against" },
                ],
              }))}
            />
          )}
        </div>
        <p className="stat-label mt-1">
          Expected goal margin vs an average Champions League side · this
          season&apos;s UCL and league form, xG-weighted
        </p>
      </header>

      <div className="px-3 pb-4 space-y-1">
        {five.map((t, i) => {
          const isBarca = t.team === "FC Barcelona"
          return (
            <div
              key={t.team}
              className={`flex items-center gap-4 px-4 py-3 rounded-xl ${
                isBarca ? "barca-stripes text-white" : ""
              }`}
            >
              <span
                className="stat-figure text-2xl w-8 text-center shrink-0"
                style={{ color: POWER_COLORS[i], fontFamily: "var(--font-condensed)" }}
              >
                {i + 1}
              </span>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {ids.get(t.team) != null && (
                    <TeamCrest teamId={ids.get(t.team)!} name={t.team} size={22} />
                  )}
                  <span className={`font-semibold text-[0.95rem] truncate ${isBarca ? "text-white" : "text-foreground"}`}>{t.team}</span>
                </div>
                <div className="flex items-center gap-2.5 mt-1.5">
                  <span className="flex h-[5px] w-20 sm:w-24 rounded-full overflow-hidden bg-white/5 shrink-0">
                    <span
                      style={{
                        width: `${(Math.abs(t.rating) / top) * 100}%`,
                        background: POWER_COLORS[i],
                        opacity: 0.8,
                      }}
                    />
                  </span>
                  <span className={`stat-label truncate ${isBarca ? "!text-white/80" : ""}`}>{basis(t)}</span>
                </div>
              </div>

            <div className="flex items-center gap-4 shrink-0">
              <div className="text-right">
                <div className="stat-figure text-lg" style={{ color: tone(t.rating, i) }}>
                  {signed(t.rating)}
                </div>
                <div className="stat-label">rating</div>
              </div>
              <div className="text-right hidden sm:block">
                <div className="stat-figure text-sm">
                  {(t.attack * model.avg).toFixed(2)}
                </div>
                <div className="stat-label">for</div>
              </div>
              <div className="text-right hidden sm:block">
                <div className="stat-figure text-sm">
                  {(t.defence * model.avg).toFixed(2)}
                </div>
                <div className="stat-label">against</div>
              </div>
            </div>
          </div>
        )
      })}
      </div>
      <p className="stat-label px-5 pb-4">
        Clubs from leagues we don&apos;t track are rated on Champions League games
        alone, pulled toward average until they&apos;ve played more.
      </p>
    </section>
  )
}
type SeasonMatch = {
  event_id: number; league: string; season: string; round: number
  date: string; kickoff?: string | null; home: string; home_id: number | null; away: string; away_id: number | null; status: string
  home_goals: number | null; away_goals: number | null
}

/**
 * Season table, stats and every match, for one season.
 *
 * Cached: this is two thousand rows plus the whole team-stats fetch, and it
 * is identical for every visitor. The live scoreline on each card comes from
 * the client poll, not from here, so a minute of staleness costs nothing.
 */
async function loadSeason(season: string, params: Params) {
  "use cache"
  // Hours, not minutes: the scraper lands results twice a day, so a shorter
  // life only means more visitors paying the cold read for identical data.
  // Live scorelines come from the client poll, not from here.
  cacheLife("hours")

  const [{ table, stats, xg }, matchData] = await Promise.all([
    fetchTeamData(supabase, season, WANTED_STATS),
    fetchAllRows<SeasonMatch>((from, to) =>
      supabase
        .from("matches")
        .select("event_id, league, season, round, date, kickoff, home, home_id, away, away_id, status, home_goals, away_goals")
        .eq("season", season)
        .order("event_id", { ascending: true })
        .range(from, to),
    ),
  ])

  const matches = matchData

  const trackedLeagues = new Set(table.map((t) => t.league))
  const trackedTeamNames = new Set(table.map((t) => t.team))

  const upcoming = matches
    .filter((m) =>
      m.status === "upcoming" &&
      trackedLeagues.has(m.league) &&
      (trackedTeamNames.has(m.home) || trackedTeamNames.has(m.away)),
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.league.localeCompare(b.league))

  const finished = matches.filter((m) => m.status === "finished")

  const allPredictable = [...upcoming, ...finished.filter((m) =>
    trackedLeagues.has(m.league) &&
    (trackedTeamNames.has(m.home) || trackedTeamNames.has(m.away)),
  )]

  const computed = predictMatches(
    allPredictable.map((m) => ({
      event_id: m.event_id,
      league: m.league,
      round: m.round,
      date: m.date,
      kickoff: m.kickoff,
      home: m.home,
      home_id: m.home_id,
      away: m.away,
      away_id: m.away_id,
    })),
    finished,
    table,
    stats,
    xg,
    params,
  )

  const uclIds: [string, number][] = []
  const seenUcl = new Set<string>()
  for (const m of matches) {
    if (m.league !== UCL) continue
    if (m.home_id && !seenUcl.has(m.home)) { seenUcl.add(m.home); uclIds.push([m.home, m.home_id]) }
    if (m.away_id && !seenUcl.has(m.away)) { seenUcl.add(m.away); uclIds.push([m.away, m.away_id]) }
  }

  return { computed, finished, xg, uclIds }
}

async function Content({
  searchParams,
}: {
  searchParams: Promise<{ season?: string; league?: string }>
}) {
  const sp = await searchParams
  const season = resolveSeason(sp.season)
  const leagueFilter = sp.league || "all"
  const leagueFullName = LEAGUE_FILTERS.find((f) => f.key === leagueFilter)?.full || null

  // The model's own settings, learnt from every finished league match. They
  // key the cache below, so a refit moves the predictions with it.
  const fit = await loadModelFit(season)
  const [{ computed, finished, xg, uclIds: uclIdPairs }, scorers] = await Promise.all([
    loadSeason(season, fit.params),
    loadTopScorers(season),
  ])
  const withFrozen = await withFrozenPredictions(computed)
  // Settled matches without a frozen row have no honest kickoff prediction;
  // keep them out of the display and the accuracy count.
  const predictions = withFrozen.filter((p) => p.actual === null || p.frozen)

  const uclIds = new Map<string, number>(uclIdPairs)
  const uclModel =
    leagueFullName === UCL ? uclStrengths(finished, xg, uclIds.keys()) : null

  const filtered = leagueFullName
    ? predictions.filter((p) => p.league === leagueFullName)
    : predictions

  const upcomingPredictions = filtered.filter((p) => p.actual === null)
  const settledPredictions = filtered.filter((p) => p.actual !== null)
  const accuracy = computeAccuracy(filtered)

  const nextRound = upcomingPredictions[0]?.round
  const nextRoundPredictions = upcomingPredictions.filter((p) => p.round === nextRound)
  const laterPredictions = upcomingPredictions.filter((p) => p.round !== nextRound)

  const recentSettled = settledPredictions
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 20)

  // Markets for the fixtures still to come. The Champions League model has no
  // low-score correction fitted, so its grid stays plain Poisson.
  const bets = new Map(
    upcomingPredictions.map((p) => [
      p.event_id,
      bestBetFor(p, p.league === UCL ? 0 : fit.params.rho, scorers),
    ]),
  )

  return (
    <>
      <AccuracyCard acc={accuracy} cal={calibration(filtered)} />
      <LearntCard fit={fit} />
      {uclModel && <UclRatings model={uclModel} ids={uclIds} />}

      {nextRoundPredictions.length > 0 && (
        <section>
          <h2
            className="text-lg font-semibold tracking-tight uppercase mb-3"
            style={{ fontFamily: "var(--font-condensed)" }}
          >
            Next up — Round {nextRound}
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 stagger">
            {nextRoundPredictions.map((p) => (
              <PredictionMatchCard key={p.event_id} p={p} bet={bets.get(p.event_id)} />
            ))}
          </div>
        </section>
      )}

      {laterPredictions.length > 0 && (
        <section>
          <h2
            className="text-lg font-semibold tracking-tight uppercase mb-3"
            style={{ fontFamily: "var(--font-condensed)" }}
          >
            Coming up
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {laterPredictions.slice(0, 30).map((p) => (
              <PredictionMatchCard key={p.event_id} p={p} bet={bets.get(p.event_id)} />
            ))}
          </div>
        </section>
      )}

      {recentSettled.length > 0 && (
        <section>
          <h2
            className="text-lg font-semibold tracking-tight uppercase mb-3"
            style={{ fontFamily: "var(--font-condensed)" }}
          >
            Recent results
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {recentSettled.map((p) => (
              <PredictionMatchCard key={p.event_id} p={p} />
            ))}
          </div>
        </section>
      )}
    </>
  )
}

export default function PredictionsPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string; league?: string }>
}) {
  return (
    <div className="mx-auto max-w-6xl px-3 sm:px-4 py-6 sm:py-14">
      <div className="mb-8 sm:mb-10 animate-fade-in">
        <h1
          className="text-3xl sm:text-5xl lg:text-6xl tracking-[-0.035em] leading-[0.95] mb-3 sm:mb-4"
          style={{ fontFamily: "var(--font-condensed)" }}
        >
          <span className="font-bold">Predictions.</span>{" "}
          <span className="font-normal text-muted-foreground">
            Receipts kept.
          </span>
        </h1>
        <p className="text-muted-foreground text-sm sm:text-base max-w-md leading-relaxed">
          Poisson model probabilities for every upcoming match — and a running
          accuracy tracker so you can see how we do.
        </p>
      </div>

      {/* Outside the boundary below, like every other page's filter: inside it
          the control vanished into its own skeleton the moment it was used. */}
      <div className="mb-6">
        <Suspense fallback={<Skeleton className="h-10 w-72 rounded-full" />}>
          <PredictionsLeagueToggle />
        </Suspense>
      </div>

      <Reveal
        fallback={
          <div className="space-y-5">
            <Skeleton className="h-[120px] rounded-2xl" />
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-[200px] rounded-xl" />
              ))}
            </div>
          </div>
        }
      >
        <div className="space-y-8">
          <Content searchParams={searchParams} />
        </div>
      </Reveal>
    </div>
  )
}
