import { Suspense } from "react"
import { Reveal } from "@/components/reveal"
import { cacheLife } from "next/cache"
import Link from "next/link"
import { supabase, fetchAllRows } from "@/lib/supabase"
import { resolveSeason } from "@/lib/seasons"
import {
  fetchTeamData,
  LEAGUE_TOURNAMENT_ID,
  LEAGUE_FILTERS,
} from "@/lib/teams"
import {
  predictMatches,
  computeAccuracy,
  PREDICTION_STATS,
  type MatchPrediction,
  type AccuracyStats,
} from "@/lib/predictions"
import { withFrozenPredictions } from "@/lib/predictions-freeze"
import { Skeleton } from "@/components/ui/skeleton"
import { PredictionsLeagueToggle } from "@/components/predictions-league-toggle"
import { PredictionMatchCard } from "@/components/prediction-match-card"
import { calibration, type Calibration } from "@/lib/calibration"
import { formatDateIST } from "@/lib/time"
import { loadModelFit, skillOf, type ModelFit } from "@/lib/fitted-model"
import { DEFAULT_PARAMS, PARAM_LABEL, type Params } from "@/lib/learn"

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

  return { computed }
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
  const { computed } = await loadSeason(season, fit.params)
  const withFrozen = await withFrozenPredictions(computed)
  // Settled matches without a frozen row have no honest kickoff prediction;
  // keep them out of the display and the accuracy count.
  const predictions = withFrozen.filter((p) => p.actual === null || p.frozen)

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

  return (
    <>
      <AccuracyCard acc={accuracy} cal={calibration(filtered)} />
      <LearntCard fit={fit} />

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
              <PredictionMatchCard key={p.event_id} p={p} />
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
              <PredictionMatchCard key={p.event_id} p={p} />
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
