import { Suspense } from "react"
import { cacheLife } from "next/cache"
import Link from "next/link"
import { supabase } from "@/lib/supabase"
import { resolveSeason } from "@/lib/seasons"
import {
  resolveCompetition,
  scopeLeague,
  scopeQuery,
  COMPETITION_LABEL,
  type Competition,
} from "@/lib/competition"
import { CompetitionToggle } from "@/components/competition-toggle"
import { TeamCrest, LeagueCrest } from "@/components/player-avatar"
import { LEAGUE_TOURNAMENT_ID } from "@/lib/teams"
import { confidence, confidenceK, type Row } from "@/lib/rank"
import { Skeleton } from "@/components/ui/skeleton"
import { SignalInfo } from "@/components/signal-info"
import { SignalExpand, type SignalExpandRow, type SignalFmt } from "@/components/signal-expand"

type PlayerRow = {
  player: string
  slug: string
  team: string
  team_id: number | null
  league: string
  position: string | null
  minutes: number
  goals_p90: number | null
  xg_p90: number | null
  xa_p90: number | null
  key_passes_p90: number | null
  big_chances_created_p90: number | null
  touches_p90: number | null
  dispossessed_p90: number | null
  dribbles_p90: number | null
  final_third_passes_p90: number | null
  total_passes_p90: number | null
  tackles_won_p90: number | null
  aerials_won_p90: number | null
  interceptions_p90: number | null
}

const n = (v: number | null | undefined) => (v == null ? 0 : Number(v))

type Signal = {
  key: string
  label: string
  hint: string
  formula: string
  what: string
  signifies: string
  why: string
  compute: (p: PlayerRow) => number
  fmt: (v: number) => string
  /** Serializable formatter key for the client-side expand dialog. */
  fmtKey: SignalFmt
  higherIsBetter: boolean
  /**
   * Who this board is allowed to rank. Every board drops goalkeepers; a rate
   * board also needs a volume floor, or players who never attempt the action
   * win it by default. That is exactly how the old press-resistance board put
   * four keepers and five centre-backs on a 100% tie at the top.
   */
  eligible?: (p: PlayerRow) => boolean
  /** Printed under the heading when the pool is narrower than "outfielders". */
  pool?: string
}

const isGk = (p: PlayerRow) => (p.position ?? "") === "Goalkeeper"

const SIGNALS: Signal[] = [
  {
    key: "finishing_edge",
    label: "Finishing Edge",
    hint: "Clinical finishing above expected",
    formula: "goals − xG, per 90",
    what: "The gap between the goals a player actually scores and the xG of the chances they take, averaged over 90 minutes.",
    signifies: "A positive number means the player beats their chances — clinical. A negative one means they waste good positions.",
    why: "xG rewards getting into shooting positions. This metric isolates the finishing on top of that: who's converting better than the average striker would from the same spots. Thin samples are pulled toward the cohort average, so a hot cameo off the bench doesn't top the board.",
    compute: (p) => n(p.goals_p90) - n(p.xg_p90),
    fmt: (v) => (v > 0 ? `+${v.toFixed(2)}` : v.toFixed(2)),
    fmtKey: "signed2",
    higherIsBetter: true,
    eligible: (p) => !isGk(p),
  },
  {
    key: "ball_security",
    label: "Ball Security",
    hint: "Rarely loses it, and actually carries",
    formula: "dispossessed ÷ touches × 100",
    what: "How many times a player is dispossessed per 100 touches, among players who regularly take the ball past someone. Lower is better.",
    signifies: "Low values = the ball sticks to them in traffic. High values = they cough it up when squeezed.",
    why: "There is no \u201cpasses under pressure\u201d column in this data, so true press resistance isn't measurable — losses per touch is, but only if the board ranks players who actually carry. Without that gate the old press-resistance board was topped by four goalkeepers and five centre-backs on an exact 100% tie: they scored perfectly by never taking the ball into contact. Requiring a completed dribble per 90 keeps this to players who put themselves in trouble on purpose.",
    compute: (p) => {
      const t = n(p.touches_p90)
      if (t <= 0) return Number.POSITIVE_INFINITY
      return (n(p.dispossessed_p90) / t) * 100
    },
    fmt: (v) => v.toFixed(1),
    fmtKey: "fixed1",
    higherIsBetter: false,
    eligible: (p) => !isGk(p) && n(p.dribbles_p90) >= 1,
    pool: "outfielders completing 1+ dribble per 90",
  },
  {
    key: "progressive_touch_rate",
    label: "Progressive Touch %",
    hint: "Share of touches that drive play forward",
    formula: "(dribbles + final-third passes) ÷ touches",
    what: "What percentage of a player's touches are progressive — a successful dribble, or a pass played in the attacking third.",
    signifies: "High values = every time they get the ball, something advances. Low values = lots of sideways recycling.",
    why: "Raw progressive-action counts flatter players who simply get the ball more because of where they play. Dividing by touches removes that volume bias. Read it with position in mind: the underlying column counts passes played in the attacking third, not passes into it, so wingers start with an advantage from where they stand.",
    compute: (p) => {
      const t = n(p.touches_p90)
      if (t <= 0) return 0
      return ((n(p.dribbles_p90) + n(p.final_third_passes_p90)) / t) * 100
    },
    fmt: (v) => `${v.toFixed(1)}%`,
    fmtKey: "pct1",
    higherIsBetter: true,
    eligible: (p) => !isGk(p),
  },
  {
    key: "creator_index",
    label: "Creator Index",
    hint: "Playmaking without assist-luck",
    formula: "xA + big chances created + ½ key passes",
    what: "A composite of expected assists, big chances created, and key passes (weighted half, since they include lower-quality chances).",
    signifies: "Measures the player's chance-creation output regardless of whether teammates finished them.",
    why: "Assists depend on strikers converting. This isolates how good the player is at manufacturing chances — the part they actually control.",
    compute: (p) =>
      n(p.xa_p90) + n(p.big_chances_created_p90) + n(p.key_passes_p90) * 0.5,
    fmt: (v) => v.toFixed(2),
    fmtKey: "fixed2",
    higherIsBetter: true,
    eligible: (p) => !isGk(p),
  },
  {
    key: "chance_quality",
    label: "Chance Quality",
    hint: "How big the chances they create are",
    formula: "big chances created ÷ key passes",
    what: "Of all the passes a player plays that lead to a shot, the share that set up a genuine big chance.",
    signifies: "High values = when they find someone, it's a real opening. Low values = plenty of shots created, mostly from distance or bad angles.",
    why: "Creator Index rewards volume, so a player who feeds twelve half-chances a game outranks one who carves out three clear ones. This is the other half: not how many chances, but how good. The two boards disagreeing about a player is the interesting part.",
    compute: (p) => {
      const kp = n(p.key_passes_p90)
      if (kp <= 0) return 0
      return Math.min(100, (n(p.big_chances_created_p90) / kp) * 100)
    },
    fmt: (v) => `${v.toFixed(1)}%`,
    fmtKey: "pct1",
    higherIsBetter: true,
    eligible: (p) => !isGk(p) && n(p.key_passes_p90) >= 2,
    pool: "outfielders creating 2+ key passes per 90",
  },
  {
    key: "ball_winning_volume",
    label: "Ball-Winning Volume",
    hint: "Raw volume — reads position as much as skill",
    formula: "tackles + interceptions + aerials won, per 90",
    what: "How often a player ends an opposition attack: successful tackles, interceptions and aerial duels won, added up per 90 minutes.",
    signifies: "Who physically wins the most ball back. Read it as workload, not as a ranking of defensive ability.",
    why: "This is deliberately labelled volume rather than dominance. The honest version of this board is a win rate — duels won over duels contested — but the three attempt columns it needs (totalTackles, totalDribbles, aerialDuelsTotal in data_loader.py) come back empty from the feed, so every row stores zero. Until that is fixed, a count is all this data supports, and a count tracks position: centre-backs and full-backs are simply put in more duels than anyone else.",
    compute: (p) =>
      n(p.tackles_won_p90) + n(p.interceptions_p90) + n(p.aerials_won_p90),
    fmt: (v) => v.toFixed(1),
    fmtKey: "fixed1",
    higherIsBetter: true,
    eligible: (p) => !isGk(p),
  },
]

const LEAGUE_TAG: Record<string, { short: string; hue: string }> = {
  "Premier League": { short: "PL", hue: "0.78 0.13 290" },
  "La Liga": { short: "LL", hue: "0.80 0.14 60" },
  "Ligue 1": { short: "L1", hue: "0.78 0.13 240" },
  Bundesliga: { short: "BL", hue: "0.78 0.14 15" },
  "Champions League": { short: "UCL", hue: "0.78 0.14 230" },
}

function LeagueTag({ league }: { league: string }) {
  const tid = LEAGUE_TOURNAMENT_ID[league]
  if (tid) return <LeagueCrest tournamentId={tid} name={league} size={18} />
  const tag = LEAGUE_TAG[league] ?? LEAGUE_TAG["Premier League"]
  return (
    <span
      className="stat-label text-[0.6rem] px-1.5 py-0.5 rounded"
      style={{ color: `oklch(${tag.hue})`, background: `oklch(${tag.hue} / 13%)` }}
    >
      {tag.short}
    </span>
  )
}

function SignalBoard({
  signal,
  rows,
  allRows,
  scope,
  ranked,
}: {
  signal: Signal
  rows: Array<PlayerRow & { value: number }>
  allRows: SignalExpandRow[]
  scope: string
  ranked: number
}) {
  return (
    <section className="surface rounded-2xl bg-card overflow-hidden">
      <header className="px-5 pt-5 pb-3">
        <div className="flex items-baseline justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2
              className="text-lg font-semibold tracking-tight uppercase"
              style={{ fontFamily: "var(--font-condensed)" }}
            >
              {signal.label}
            </h2>
            <SignalInfo
              label={signal.label}
              formula={signal.formula}
              what={signal.what}
              signifies={signal.signifies}
              why={signal.why}
            />
            <SignalExpand
              label={signal.label}
              formula={signal.formula}
              rows={allRows}
              fmt={signal.fmtKey}
              scope={scope}
            />
          </div>
          <span className="stat-label truncate">{signal.formula}</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {signal.hint}
          {!signal.higherIsBetter && " · lower is better"}
        </p>
        <p className="stat-label mt-1">
          {ranked} {signal.pool ?? "outfielders"}
        </p>
      </header>
      <div className="px-2 pb-2">
        {rows.map((p, i) => (
          <Link
            key={`${p.slug}-${i}`}
            href={`/player/${p.slug}${scope}`}
            className="row-item flex items-center gap-3 px-3 py-2.5 rounded-xl"
          >
            <span className="rank-badge" data-rank={i + 1}>
              {i + 1}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[0.9rem] font-medium leading-tight truncate">
                {p.player}
              </span>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {p.team_id != null && (
                  <TeamCrest teamId={p.team_id} name={p.team} size={14} />
                )}
                <span className="truncate">{p.team}</span>
              </span>
            </span>
            <LeagueTag league={p.league} />
            <span
              className="stat-figure text-xl w-14 text-right"
              style={{ color: i < 3 ? "var(--pitch)" : undefined }}
            >
              {signal.fmt(p.value)}
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}

/**
 * Every tracked player's per-90 rates for a season and competition.
 *
 * Cached: two thousand rows of season aggregates, the same for everyone, and
 * the boards below are pure maths over them.
 */
async function loadPlayers(season: string, comp: Competition): Promise<PlayerRow[]> {
  "use cache"
  cacheLife("minutes")

  const { data } = await scopeLeague(
    supabase
      .from("players")
      .select(
        "player, slug, team, team_id, league, position, minutes, " +
          "goals_p90, xg_p90, xa_p90, key_passes_p90, big_chances_created_p90, " +
          "touches_p90, dispossessed_p90, dribbles_p90, " +
          "final_third_passes_p90, total_passes_p90, " +
          "tackles_won_p90, aerials_won_p90, interceptions_p90",
      )
      .eq("season", season),
    comp,
  ).limit(2000)

  return (data || []) as unknown as PlayerRow[]
}

async function Content({
  searchParams,
}: {
  searchParams: Promise<{ season?: string; comp?: string }>
}) {
  const sp = await searchParams
  const season = resolveSeason(sp.season)
  const comp = resolveCompetition(sp.comp)
  const scope = scopeQuery(season, comp)
  const label = `${season} · ${COMPETITION_LABEL[comp]}`

  const all = await loadPlayers(season, comp)
  // A floor, not the whole defence against noise: it keeps out players with
  // almost no season, and the shrinkage below handles everyone above it.
  const maxMin = Math.max(0, ...all.map((p) => Number(p.minutes) || 0))
  const minMin = Math.max(300, maxMin * 0.3)
  const eligible = all.filter((p) => Number(p.minutes) >= minMin)
  // Half-trust point, from the same helper the player rankings use.
  const k = confidenceK(eligible as unknown as Row[])

  const boards = SIGNALS.map((s) => {
    const pool = s.eligible ? eligible.filter(s.eligible) : eligible
    const raw = pool
      .map((p) => ({ ...p, raw: s.compute(p) }))
      .filter((p) => Number.isFinite(p.raw))
    // Shrink each board toward its own pool's mean, so a player with a third
    // of a season behind a flashy rate lands near average rather than on top.
    const mean = raw.length
      ? raw.reduce((t, p) => t + p.raw, 0) / raw.length
      : 0
    const scored = raw.map((p) => ({
      ...p,
      value: mean + confidence(Number(p.minutes) || 0, k) * (p.raw - mean),
    }))
    scored.sort((a, b) => (s.higherIsBetter ? b.value - a.value : a.value - b.value))
    // Slim shape sent to the client expand dialog — drops the raw p90 columns.
    const allRows: SignalExpandRow[] = scored.map((p) => ({
      slug: p.slug,
      player: p.player,
      team: p.team,
      team_id: p.team_id,
      league: p.league,
      value: p.value,
    }))
    return { signal: s, rows: scored.slice(0, 10), allRows, ranked: scored.length }
  })

  return (
    <>
      <p className="stat-label mb-4">
        {label} · min {Math.round(minMin)} minutes · {eligible.length} players ·
        thin samples pulled toward each board&apos;s average
      </p>
      <div className="grid lg:grid-cols-2 gap-5 stagger">
        {boards.map((b) => (
          <SignalBoard
            key={b.signal.key}
            signal={b.signal}
            rows={b.rows}
            ranked={b.ranked}
            allRows={b.allRows}
            scope={scope}
          />
        ))}
      </div>
    </>
  )
}

function BoardsSkeleton() {
  return (
    <div className="grid lg:grid-cols-2 gap-5">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-[520px] rounded-2xl" />
      ))}
    </div>
  )
}

export default function SignalsPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string; comp?: string }>
}) {
  return (
    <div className="mx-auto max-w-6xl px-3 sm:px-4 py-6 sm:py-14">
      <div className="relative z-10 mb-6 sm:mb-8 animate-fade-in">
        <h1
          className="text-3xl sm:text-5xl lg:text-6xl tracking-[-0.035em] leading-[0.95] mb-3 sm:mb-4"
          style={{ fontFamily: "var(--font-condensed)" }}
        >
          <span className="font-bold">Signals.</span>{" "}
          <span className="font-normal text-muted-foreground">
            Metrics the raw stats don&apos;t show.
          </span>
        </h1>
        <p className="text-muted-foreground text-sm sm:text-base max-w-xl mb-4 sm:mb-5 leading-relaxed">
          Derived from per-90 production. Each board ranks the players who
          separate themselves on one dimension — finishing above xG, keeping the
          ball under pressure, breaking lines, creating chances, or winning
          duels.
        </p>
        <Suspense fallback={null}>
          <CompetitionToggle />
        </Suspense>
      </div>

      <Suspense fallback={<BoardsSkeleton />}>
        <Content searchParams={searchParams} />
      </Suspense>
    </div>
  )
}
