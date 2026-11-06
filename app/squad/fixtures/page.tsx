import { Suspense } from "react"
import Link from "next/link"
import { HouseIcon, PlaneIcon } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { BARCA_ID, LEAGUE_TOURNAMENT_ID } from "@/lib/teams"
import { UCL } from "@/lib/competition"
import { resolveFixtureScope, scopeFixtures } from "@/lib/squad"
import { outcomeFor, summarise, type Played } from "@/lib/form"
import { FixtureCompetitionFilter } from "@/components/fixture-competition-filter"
import { FormStrip, OUTCOME_TONE, OUTCOME_LABEL } from "@/components/form-strip"
import { TeamCrest, LeagueCrest } from "@/components/player-avatar"
import { BarcaNav } from "@/components/barca-nav"
import { Skeleton } from "@/components/ui/skeleton"
import { formatDateIST, formatTimeIST } from "@/lib/time"

const BARCA = "FC Barcelona"
const COLS = "event_id, date, league, home, home_id, away, away_id"
const RESULT_COLS = `${COLS}, home_goals, away_goals`

type Result = Row & { home_goals: number | null; away_goals: number | null }

/** Per-match detail worth a subline; `stat` matches match_stats verbatim. */
const DETAIL_STATS = ["Expected goals", "Ball possession", "Total shots"] as const

/** event_id -> stat -> [home, away], as stored (possession carries its %). */
type Detail = Map<number, Record<string, [string, string]>>

type Row = {
  event_id: number
  date: string
  league: string
  home: string
  home_id: number | null
  away: string
  away_id: number | null
  kickoff?: string | null
}

function formatDate(iso: string, kickoff?: string | null) {
  if (kickoff) {
    return formatDateIST(kickoff)
  }
  return formatDateIST(`${iso}T12:00:00Z`)
}

function formatTime(kickoff: string) {
  return formatTimeIST(kickoff)
}

function FixtureRow({ m, banner }: { m: Row; banner: boolean }) {
  const atHome = m.home_id === BARCA_ID
  const opponent = atHome ? m.away : m.home
  const opponentId = atHome ? m.away_id : m.home_id
  const tid = LEAGUE_TOURNAMENT_ID[m.league]
  return (
    <Link
      href={`/predictions/match?id=${m.event_id}`}
      className={`card-lift fixture-row surface rounded-2xl px-4 py-3.5 flex items-center gap-4 ${
        banner && m.league === UCL ? "ucl-row" : "bg-card"
      }`}
    >
      <span className="flex flex-col leading-none w-24 shrink-0">
        <span className="stat-label text-xs">{formatDate(m.date, m.kickoff)}</span>
        <span className="stat-figure text-sm mt-1 text-muted-foreground">
          {m.kickoff ? formatTime(m.kickoff) : "TBC"}
        </span>
      </span>
      <span className="flex items-center gap-2 min-w-0 flex-1">
        <TeamCrest teamId={BARCA_ID} name={BARCA} size={28} />
        <span className="stat-label text-[0.6rem]">{atHome ? "vs" : "at"}</span>
        {opponentId != null && (
          <TeamCrest teamId={opponentId} name={opponent} size={28} />
        )}
        <span className="truncate font-semibold text-[0.95rem]">{opponent}</span>
      </span>
      <span
        className="shrink-0 text-muted-foreground"
        aria-label={atHome ? "Home" : "Away"}
        title={atHome ? "Home" : "Away"}
      >
        {atHome ? (
          <HouseIcon className="size-4" style={{ color: "var(--pitch)" }} aria-hidden />
        ) : (
          <PlaneIcon className="size-4" aria-hidden />
        )}
      </span>
      {tid && <LeagueCrest tournamentId={tid} name={m.league} size={20} />}
    </Link>
  )
}

/**
 * "xG 1.88–0.20 · 64% ball · 20 shots", always Barça-first.
 *
 * Values are rendered as stored: the loader keeps the unit in the string
 * ("64%"), so reformatting here would only risk disagreeing with the match
 * page, which reads the same rows.
 */
function detailLine(stats: Record<string, [string, string]> | undefined, atHome: boolean) {
  if (!stats) return null
  const side = (k: string) => {
    const pair = stats[k]
    if (!pair) return null
    return atHome ? pair : [pair[1], pair[0]]
  }
  const xg = side("Expected goals")
  const poss = side("Ball possession")
  const shots = side("Total shots")
  const parts = [
    xg && `xG ${xg[0]}\u2013${xg[1]}`,
    poss && `${poss[0]} ball`,
    shots && `${shots[0]} shots`,
  ].filter(Boolean)
  return parts.length ? parts.join(" \u00b7 ") : null
}

function ResultRow({ m, detail }: { m: Result; detail?: Record<string, [string, string]> }) {
  const atHome = m.home_id === BARCA_ID
  const opponent = atHome ? m.away : m.home
  const opponentId = atHome ? m.away_id : m.home_id
  const tid = LEAGUE_TOURNAMENT_ID[m.league]
  const outcome = outcomeFor(m, BARCA_ID)
  const [ours, theirs] = atHome
    ? [m.home_goals, m.away_goals]
    : [m.away_goals, m.home_goals]
  const line = detailLine(detail, atHome)

  return (
    <Link
      href={`/predictions/match?id=${m.event_id}`}
      className="card-lift fixture-row surface bg-card rounded-2xl px-4 py-3.5 flex items-center gap-4"
    >
      <span className="flex items-center gap-2.5 w-20 shrink-0">
        {outcome && (
          <span
            aria-label={OUTCOME_LABEL[outcome]}
            title={OUTCOME_LABEL[outcome]}
            className="size-5 rounded-full grid place-items-center text-[0.6rem] font-bold text-white shrink-0"
            style={{ background: OUTCOME_TONE[outcome] }}
          >
            {outcome}
          </span>
        )}
        <span className="stat-label text-xs">{formatDate(m.date)}</span>
      </span>
      <span className="flex items-center gap-2 min-w-0 flex-1">
        <TeamCrest teamId={BARCA_ID} name={BARCA} size={28} />
        <span className="stat-label text-[0.6rem]">{atHome ? "vs" : "at"}</span>
        {opponentId != null && (
          <TeamCrest teamId={opponentId} name={opponent} size={28} />
        )}
        <span className="min-w-0">
          <span className="block truncate font-semibold text-[0.95rem]">{opponent}</span>
          {line && (
            <span className="stat-label block text-[0.6rem] truncate">{line}</span>
          )}
        </span>
      </span>
      <span className="stat-figure text-base shrink-0 tabular-nums">
        {ours ?? "–"}&ndash;{theirs ?? "–"}
      </span>
      {tid && <LeagueCrest tournamentId={tid} name={m.league} size={20} />}
    </Link>
  )
}

/** The last ten played matches, scoped by the same competition filter. */
async function Results({
  searchParams,
}: {
  searchParams: Promise<{ comp?: string }>
}) {
  const scope = resolveFixtureScope((await searchParams).comp)
  const base = supabase
    .from("matches")
    .select(RESULT_COLS)
    .eq("status", "finished")
    .or(`home_id.eq.${BARCA_ID},away_id.eq.${BARCA_ID}`)
    .order("date", { ascending: false })
    .limit(10)
  const { data } = await scopeFixtures(base, scope)
  // A finished row without a score is postponed or voided, not a result.
  const rows = ((data || []) as unknown as Result[]).filter(
    (m) => outcomeFor(m, BARCA_ID) != null,
  )

  if (rows.length === 0) {
    return <p className="text-muted-foreground">No results in this competition yet.</p>
  }

  // One extra round trip for the whole list, not one per row.
  const { data: statRows } = await supabase
    .from("match_stats")
    .select("event_id, stat, home, away")
    .in("event_id", rows.map((m) => m.event_id))
    .in("stat", DETAIL_STATS as unknown as string[])

  const detail: Detail = new Map()
  for (const r of (statRows || []) as { event_id: number; stat: string; home: string; away: string }[]) {
    const entry = detail.get(r.event_id) ?? {}
    entry[r.stat] = [r.home, r.away]
    detail.set(r.event_id, entry)
  }

  return (
    <div className="flex flex-col gap-2.5 stagger">
      {rows.map((m) => (
        <ResultRow key={m.event_id} m={m} detail={detail.get(m.event_id)} />
      ))}
    </div>
  )
}

/** Last-five form from results already in the table — no new ingestion. */
async function BarcaForm({
  searchParams,
}: {
  searchParams: Promise<{ comp?: string }>
}) {
  const scope = resolveFixtureScope((await searchParams).comp)
  // Ten rows to find five played ones: a postponed or voided fixture can sit
  // in `finished` with no score.
  const base = supabase
    .from("matches")
    .select("date, home_id, away_id, home_goals, away_goals")
    .eq("status", "finished")
    .or(`home_id.eq.${BARCA_ID},away_id.eq.${BARCA_ID}`)
    .order("date", { ascending: false })
    .limit(10)

  const { data } = await scopeFixtures(base, scope)

  return <FormStrip form={summarise((data || []) as unknown as Played[], BARCA_ID)} />
}

async function Fixtures({
  searchParams,
}: {
  searchParams: Promise<{ comp?: string }>
}) {
  const scope = resolveFixtureScope((await searchParams).comp)
  const q = (cols: string) => {
    const base = supabase
      .from("matches")
      .select(cols)
      .eq("status", "upcoming")
      .or(`home_id.eq.${BARCA_ID},away_id.eq.${BARCA_ID}`)
      .order("date", { ascending: true })
      .limit(30)
    return scopeFixtures(base, scope)
  }
  // `kickoff` is a newer column; drop it rather than lose the list if the
  // database hasn't been migrated yet (same fallback as the nav pill).
  let { data } = await q(`${COLS}, kickoff`)
  if (!data) ({ data } = await q(COLS))
  const rows = (data || []) as unknown as Row[]

  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground">
        No upcoming Barça fixtures in this competition.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2.5 stagger">
      {rows.map((m) => (
        <FixtureRow key={m.event_id} m={m} banner={scope !== "ucl"} />
      ))}
    </div>
  )
}

export default function BarcaFixturesPage({
  searchParams,
}: {
  searchParams: Promise<{ comp?: string }>
}) {
  return (
    <div className="mx-auto max-w-6xl px-3 sm:px-4 py-6 sm:py-14">
      <div className="mb-6 flex items-center gap-3 animate-fade-in">
        <TeamCrest teamId={BARCA_ID} name={BARCA} size={36} className="shrink-0" />
        <div>
          <h1
            className="text-3xl sm:text-5xl font-bold tracking-[-0.035em] leading-none"
            style={{ fontFamily: "var(--font-condensed)" }}
          >
            FIXTURES
          </h1>
          <p className="text-muted-foreground text-xs sm:text-sm mt-1 leading-snug">
            Every upcoming Barça match. Tap one for the prediction breakdown.
          </p>
        </div>
      </div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Suspense fallback={<Skeleton className="h-10 w-44 rounded-full" />}>
          <BarcaNav />
        </Suspense>
        <Suspense fallback={<Skeleton className="h-10 w-40 rounded-full" />}>
          <FixtureCompetitionFilter />
        </Suspense>
        <Suspense fallback={<Skeleton className="h-9 w-56 rounded-full" />}>
          <BarcaForm searchParams={searchParams} />
        </Suspense>
      </div>
      <section className="mb-10">
        <h2
          className="text-lg font-semibold tracking-tight uppercase mb-2.5"
          style={{ fontFamily: "var(--font-condensed)" }}
        >
          Upcoming
        </h2>
        <Suspense
          fallback={
            <div className="flex flex-col gap-2.5">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-[74px] rounded-2xl" />
              ))}
            </div>
          }
        >
          <Fixtures searchParams={searchParams} />
        </Suspense>
      </section>

      <section>
        <h2
          className="text-lg font-semibold tracking-tight uppercase mb-2.5"
          style={{ fontFamily: "var(--font-condensed)" }}
        >
          Recent Results
        </h2>
        <Suspense
          fallback={
            <div className="flex flex-col gap-2.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-[74px] rounded-2xl" />
              ))}
            </div>
          }
        >
          <Results searchParams={searchParams} />
        </Suspense>
      </section>
    </div>
  )
}
