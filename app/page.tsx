import { Suspense } from "react"
import { connection } from "next/server"
import { cacheLife } from "next/cache"
import { supabase } from "@/lib/supabase"
import { resolveSeason } from "@/lib/seasons"
import { resolveCompetition, scopeLeague, scopeQuery, COMPETITION_LABEL, UCL, type Competition } from "@/lib/competition"
import { CompetitionToggle } from "@/components/competition-toggle"
import { LEAGUE_TOURNAMENT_ID } from "@/lib/teams"
import { PlayerSearch } from "@/components/player-search"
import { LeagueCrest, TeamCrest } from "@/components/player-avatar"
import { UpcomingTicker, type UpcomingMatch } from "@/components/upcoming-ticker"
import { Skeleton } from "@/components/ui/skeleton"
import Link from "next/link"

function BallIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5 8.6 10l1.3 4h4.2l1.3-4z" />
      <path d="M12 3v4.5M4.2 9.6 8.6 10M19.8 9.6 15.4 10M7.1 19.3 9.9 14M16.9 19.3 14.1 14" />
    </svg>
  )
}

function AssistIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 17c0-5 4-8 9-8h5" />
      <path d="M13 5.5 17.5 9 13 12.5" />
    </svg>
  )
}

function HeadlineSkeleton() {
  return (
    <div className="grid sm:grid-cols-2 gap-3">
      {Array.from({ length: 2 }).map((_, i) => (
        <Skeleton key={i} className="h-[104px] rounded-2xl" />
      ))}
    </div>
  )
}

function BoardSkeleton() {
  return (
    <div className="grid md:grid-cols-2 gap-5">
      {Array.from({ length: 2 }).map((_, i) => (
        <Skeleton key={i} className="h-[420px] rounded-2xl" />
      ))}
    </div>
  )
}

type Row = {
  player: string
  slug: string
  team: string
  team_id: number | null
  league: string
  goals?: number
  assists?: number
}

// Keep these hues in sync with LEAGUE_HUE in components/player-search.tsx.
const LEAGUE_TAG: Record<string, { short: string; hue: string }> = {
  "Premier League": { short: "PL", hue: "0.78 0.13 290" },
  "La Liga": { short: "LL", hue: "0.80 0.14 60" },
  "Ligue 1": { short: "L1", hue: "0.78 0.13 240" },
  Bundesliga: { short: "BL", hue: "0.78 0.14 15" },
  "Serie A": { short: "SA", hue: "0.78 0.14 120" },
  "Champions League": { short: "UCL", hue: "0.78 0.14 230" },
}

function LeagueTag({ league }: { league: string }) {
  const tid = LEAGUE_TOURNAMENT_ID[league]
  if (tid) {
    return <LeagueCrest tournamentId={tid} name={league} size={20} />
  }
  const tag = LEAGUE_TAG[league] ?? LEAGUE_TAG["Premier League"]
  return (
    <span
      className="stat-label text-[0.6rem] px-1.5 py-0.5 rounded"
      style={{
        color: `oklch(${tag.hue})`,
        background: `oklch(${tag.hue} / 13%)`,
      }}
    >
      {tag.short}
    </span>
  )
}

function Board({
  title,
  rows,
  statKey,
  label,
  scope,
}: {
  title: string
  rows: Row[]
  statKey: "goals" | "assists"
  label: string
  scope: string
}) {
  return (
    <section className="surface rounded-2xl bg-card overflow-hidden">
      <header className="flex items-baseline justify-between px-4 pt-4 pb-2.5 sm:px-5 sm:pt-5 sm:pb-3">
        <h2
          className="text-base sm:text-lg font-semibold tracking-tight"
          style={{ fontFamily: "var(--font-condensed)" }}
        >
          {title}
        </h2>
        <span className="stat-label text-xs sm:text-sm">{label}</span>
      </header>
      <div className="px-1.5 sm:px-2 pb-2">
        {rows.map((p, i) => (
          <Link
            key={`${p.slug}-${i}`}
            href={`/player/${p.slug}${scope}`}
            className="row-item flex items-center gap-2 sm:gap-3 px-2.5 py-2 sm:px-3 sm:py-2.5 rounded-xl"
          >
            <span className="rank-badge shrink-0" data-rank={i + 1}>
              {i + 1}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[0.85rem] sm:text-[0.9rem] font-medium leading-tight truncate">
                {p.player}
              </span>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {p.team_id != null && (
                  <TeamCrest teamId={p.team_id} name={p.team} size={14} />
                )}
                <span className="truncate">{p.team}</span>
              </span>
            </span>
            <div className="shrink-0">
              <LeagueTag league={p.league} />
            </div>
            <span
              className="stat-figure text-lg sm:text-xl w-8 sm:w-9 text-right shrink-0"
              style={{ color: i < 3 ? "var(--pitch)" : undefined }}
            >
              {p[statKey]}
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}

/** The week's fixtures. Cached on the date pair, so it is fetched once a day. */
async function loadUpcoming(from: string, to: string) {
  "use cache"
  cacheLife("minutes")

  const { data } = await supabase
    .from("matches")
    .select("event_id, league, date, home, home_id, away, away_id")
    .eq("status", "upcoming")
    .gte("date", from)
    .lte("date", to)
    .order("date", { ascending: true })
    .limit(50)
  return (data || []) as unknown as UpcomingMatch[]
}

async function Upcoming() {
  // connection() opts this leaf into dynamic rendering so new Date() is
  // allowed under Cache Components. The parent Suspense boundary lets the
  // rest of the hero prerender while this streams in.
  await connection()
  const today = new Date()
  const in7 = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  return <UpcomingTicker matches={await loadUpcoming(iso(today), iso(in7))} />
}

/**
 * Season scoring and assist boards.
 *
 * Cached: a season total is the same for every visitor and only moves when a
 * match is ingested, so the two queries ran on every single page view for
 * nothing.
 */
async function loadBoards(season: string, comp: Competition) {
  "use cache"
  cacheLife("minutes")

  if (comp === "all") {
    const [dScorers, uclScorers, dAssists, uclAssists] = await Promise.all([
      supabase
        .from("players")
        .select("slug")
        .eq("season", season)
        .neq("league", UCL)
        .order("goals", { ascending: false })
        .limit(30),
      supabase
        .from("players")
        .select("slug")
        .eq("season", season)
        .eq("league", UCL)
        .order("goals", { ascending: false })
        .limit(20),
      supabase
        .from("players")
        .select("slug")
        .eq("season", season)
        .neq("league", UCL)
        .order("assists", { ascending: false })
        .limit(30),
      supabase
        .from("players")
        .select("slug")
        .eq("season", season)
        .eq("league", UCL)
        .order("assists", { ascending: false })
        .limit(20),
    ])

    const slugs = new Set<string>()
    for (const res of [dScorers.data, uclScorers.data, dAssists.data, uclAssists.data]) {
      for (const r of res || []) {
        if (r.slug) slugs.add(r.slug)
      }
    }

    const { data: allRows } = await supabase
      .from("players")
      .select("player, slug, team, team_id, league, goals, assists, minutes")
      .eq("season", season)
      .in("slug", Array.from(slugs))

    const groups = new Map<string, (Row & { minutes?: number })[]>()
    for (const r of (allRows || []) as (Row & { minutes?: number })[]) {
      const list = groups.get(r.slug)
      if (list) list.push(r)
      else groups.set(r.slug, [r])
    }

    const combined: Row[] = []
    for (const group of groups.values()) {
      if (group.length === 1) {
        combined.push({
          player: group[0].player,
          slug: group[0].slug,
          team: group[0].team,
          team_id: group[0].team_id,
          league: group[0].league,
          goals: group[0].goals ?? 0,
          assists: group[0].assists ?? 0,
        })
        continue
      }
      const domesticRow = group.find((r) => r.league !== UCL)
      const base = domesticRow ?? [...group].sort((a, b) => (Number(b.minutes) || 0) - (Number(a.minutes) || 0))[0]
      const goals = group.reduce((sum, r) => sum + (Number(r.goals) || 0), 0)
      const assists = group.reduce((sum, r) => sum + (Number(r.assists) || 0), 0)
      combined.push({
        player: base.player,
        slug: base.slug,
        team: base.team,
        team_id: base.team_id,
        league: base.league,
        goals,
        assists,
      })
    }

    const topScorers = [...combined].sort((a, b) => (b.goals ?? 0) - (a.goals ?? 0)).slice(0, 12)
    const topAssisters = [...combined].sort((a, b) => (b.assists ?? 0) - (a.assists ?? 0)).slice(0, 12)

    return { topScorers, topAssisters }
  }

  const [{ data: scorers }, { data: assisters }] = await Promise.all([
    scopeLeague(
      supabase
        .from("players")
        .select("player, slug, team, team_id, league, goals")
        .eq("season", season),
      comp,
    )
      .order("goals", { ascending: false })
      .limit(12),
    scopeLeague(
      supabase
        .from("players")
        .select("player, slug, team, team_id, league, assists")
        .eq("season", season),
      comp,
    )
      .order("assists", { ascending: false })
      .limit(12),
  ])

  return {
    topScorers: (scorers || []) as Row[],
    topAssisters: (assisters || []) as Row[],
  }
}

async function Content({
  searchParams,
}: {
  searchParams: Promise<{ season?: string; comp?: string }>
}) {
  // Awaited here, inside the Suspense boundary: cacheComponents won't let a
  // prerendered route read request data at the top level.
  const sp = await searchParams
  const season = resolveSeason(sp.season)
  const comp = resolveCompetition(sp.comp)
  const scope = scopeQuery(season, comp)
  const label =
    comp === "all"
      ? `${season} · All (League + UCL)`
      : `${season} · ${COMPETITION_LABEL[comp]}`
  const { topScorers, topAssisters } = await loadBoards(season, comp)
  const leader = topScorers[0]
  const creator = topAssisters[0]

  const headline = [
    {
      icon: <BallIcon />,
      label: comp === "all" ? "Leading scorer (All Competitions)" : "Leading scorer",
      figure: leader?.goals ?? 0,
      unit: "goals",
      name: leader?.player,
      team: leader?.team,
      team_id: leader?.team_id,
      slug: leader?.slug,
    },
    {
      icon: <AssistIcon />,
      label: comp === "all" ? "Most assists (All Competitions)" : "Most assists",
      figure: creator?.assists ?? 0,
      unit: "assists",
      name: creator?.player,
      team: creator?.team,
      team_id: creator?.team_id,
      slug: creator?.slug,
    },
  ]

  return (
    <>
      <div className="grid sm:grid-cols-2 gap-2.5 sm:gap-3 mb-5 stagger">
        {headline.map((s) => (
          <Link
            key={s.label}
            href={s.slug ? `/player/${s.slug}${scope}` : "/"}
            className={`card-lift surface-raised rounded-2xl px-4 py-3.5 sm:px-5 sm:py-4 flex items-center gap-3 sm:gap-4 ${
              s.team === "FC Barcelona" ? "barca-stripes" : "bg-card"
            }`}
          >
            <span style={{ color: "var(--pitch)" }} className="shrink-0">{s.icon}</span>
            <span className="flex-1 min-w-0">
              <span className="stat-label text-[0.65rem] sm:text-xs block">{s.label}</span>
              <span className="block text-sm sm:text-base font-semibold truncate leading-snug">
                {s.name}
              </span>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {s.team_id != null && s.team && (
                  <TeamCrest teamId={s.team_id} name={s.team} size={14} />
                )}
                <span className="truncate">{s.team}</span>
              </span>
            </span>
            <span className="text-right shrink-0">
              <span className="stat-figure stat-pop shimmer-text block text-3xl sm:text-4xl">
                {s.figure}
              </span>
              <span className="stat-label text-[0.65rem] sm:text-xs block mt-0.5">{s.unit}</span>
            </span>
          </Link>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4 sm:gap-5 stagger">
        <Board title="TOP SCORERS" rows={topScorers} statKey="goals" label={label} scope={scope} />
        <Board title="TOP ASSISTS" rows={topAssisters} statKey="assists" label={label} scope={scope} />
      </div>
    </>
  )
}

export default function Home({
  searchParams,
}: {
  searchParams: Promise<{ season?: string; comp?: string }>
}) {
  return (
    <div className="mx-auto max-w-6xl px-3 sm:px-4 py-6 sm:py-14">
      <div className="relative z-10 mb-8 sm:mb-10 grid gap-6 sm:gap-8 lg:grid-cols-[1fr_22rem] lg:items-start animate-fade-in">
        <div>
          <h1
            className="text-3xl sm:text-5xl lg:text-6xl tracking-[-0.035em] leading-[0.95] mb-3 sm:mb-4"
            style={{ fontFamily: "var(--font-condensed)" }}
          >
            <span className="font-bold">Every touch.</span>{" "}
            <span className="font-normal text-muted-foreground">
              Every number.
            </span>
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base max-w-md mb-5 sm:mb-7 leading-relaxed">
            Per-90 stats and percentile ranks for every player in Europe&apos;s
            top five leagues and the Champions League.
          </p>
          <div className="max-w-md w-full">
            <PlayerSearch linkToProfile placeholder="Search for a player..." />
          </div>
          <div className="mt-4">
            <Suspense fallback={null}>
              <CompetitionToggle />
            </Suspense>
          </div>
        </div>
        <Suspense fallback={<Skeleton className="h-[200px] sm:h-[230px] rounded-2xl" />}>
          <Upcoming />
        </Suspense>
      </div>

      <Suspense
        fallback={
          <>
            <div className="mb-5">
              <HeadlineSkeleton />
            </div>
            <BoardSkeleton />
          </>
        }
      >
        <Content searchParams={searchParams} />
      </Suspense>
    </div>
  )
}
