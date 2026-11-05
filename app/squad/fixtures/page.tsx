import { Suspense } from "react"
import Link from "next/link"
import { HouseIcon, PlaneIcon } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { BARCA_ID, LEAGUE_TOURNAMENT_ID } from "@/lib/teams"
import { UCL } from "@/lib/competition"
import { resolveFixtureScope } from "@/lib/squad"
import { FixtureCompetitionFilter } from "@/components/fixture-competition-filter"
import { TeamCrest, LeagueCrest } from "@/components/player-avatar"
import { BarcaNav } from "@/components/barca-nav"
import { Skeleton } from "@/components/ui/skeleton"

const BARCA = "FC Barcelona"
const COLS = "event_id, date, league, home, home_id, away, away_id"

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

function formatDate(iso: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  })
}

function formatTime(kickoff: string) {
  return new Date(kickoff).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Madrid",
  })
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
      <span className="flex flex-col leading-none w-20 shrink-0">
        <span className="stat-label text-xs">{formatDate(m.date)}</span>
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
    if (scope === "ucl") return base.eq("league", UCL)
    if (scope === "league") return base.neq("league", UCL)
    return base
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
    <div className="mx-auto max-w-6xl px-4 py-14">
      <div className="mb-6 flex items-center gap-3 animate-fade-in">
        <TeamCrest teamId={BARCA_ID} name={BARCA} size={40} />
        <div>
          <h1
            className="text-4xl sm:text-5xl font-bold tracking-[-0.035em] leading-none"
            style={{ fontFamily: "var(--font-condensed)" }}
          >
            FIXTURES
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
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
      </div>
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
    </div>
  )
}
