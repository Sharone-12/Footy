import { Suspense } from "react"
import { supabase } from "@/lib/supabase"
import { resolveSeason } from "@/lib/seasons"
import {
  resolveCompetition,
  inCompetition,
  scopeLeague,
  scopeQuery,
  UCL,
  type Competition,
} from "@/lib/competition"
import { combineCompetitions } from "@/lib/leaders"
import { CompetitionToggle } from "@/components/competition-toggle"
import { notFound } from "next/navigation"
import { RADAR_STATS, STAT_GROUPS, percentileRank } from "@/lib/stats"
import { PlayerRadar, StatBarChart } from "@/components/charts"
import { PlayerAvatar, TeamCrest } from "@/components/player-avatar"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import Link from "next/link"

function Loading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <Skeleton className="h-10 w-72 mb-3" />
      <Skeleton className="h-4 w-48 mb-10" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-[400px] rounded-xl" />
    </div>
  )
}

async function PlayerContent({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ season?: string; comp?: string }>
}) {
  const { slug } = await params
  const sp = await searchParams
  const season = resolveSeason(sp.season)
  const comp = resolveCompetition(sp.comp)

  // Up to one row per season per competition, so no limit of 2: that dropped
  // the Champions League row whenever a player had both.
  const { data: players } = await supabase
    .from("players")
    .select("*")
    .eq("slug", slug)
    .order("season", { ascending: false })
    .order("minutes", { ascending: false })

  if (!players || players.length === 0) notFound()

  // Prefer the chosen competition, then the selected season; fall back to the
  // newest row we hold, since a player may not appear in both.
  let pool: Record<string, unknown>[]
  if (comp === "all") {
    const allData = (players || []) as Record<string, unknown>[]
    const seasonRows = allData.filter((p) => p.season === season)
    const otherRows = allData.filter((p) => p.season !== season)
    pool = [...combineCompetitions(seasonRows), ...combineCompetitions(otherRows)]
  } else {
    const inComp = players.filter((p) => inCompetition(p.league as string, comp))
    pool = (inComp.length ? inComp : players) as unknown as Record<string, unknown>[]
  }

  const player = ((pool.find((p) => p.season === season) ??
    pool[0]) as unknown) as Record<string, unknown>
  const shown: Competition = comp === "ucl" ? "ucl" : "league"
  const playsUcl = players.some((p) => p.league === UCL)

  const { data: positionPeers } = await scopeLeague(
    supabase
      .from("players")
      // Both sets: the radar needs RADAR_STATS, the bars need every
      // STAT_GROUPS key. Selecting only the radar's left the rest undefined,
      // so each bar's cohort best read 0 and the bar scaled to the player's
      // own value — which is 100% by definition.
      .select(
        [...new Set([
          ...RADAR_STATS.map((s) => s.key),
          ...STAT_GROUPS.flatMap((g) => g.stats.map((s) => s.key)),
        ])].join(","),
      )
      // Peers in the same ROLE, not the same broad bucket: a winger compared
      // against every midfielder is measured on the wrong job.
      .eq("role", (player.role as string) || (player.position as string))
      .eq("season", player.season as string),
    // ...and the same competition, or a full league season is ranked against
    // a handful of Champions League games.
    shown,
  )

  const peers = (positionPeers as unknown) as Record<string, unknown>[] | null

  const radarData = RADAR_STATS.map((s) => {
    const allValues = (peers || []).map((p) => Number(p[s.key]) || 0)
    const pct = percentileRank(Number(player[s.key]) || 0, allValues)
    return { stat: s.label, [player.player as string]: pct }
  })

  /**
   * Bar length is measured against the positional cohort, not against the
   * player's own number — one value is always its own maximum, so every bar
   * used to render full whatever it said.
   *
   * The cohort's best, so a full bar means "nobody in this position does
   * more of it". A 95th percentile was tried first and pegged ten of this
   * page's twenty-eight bars for a single player, which loses the resolution
   * the bars exist to show.
   */
  const barScale: Record<string, number> = {}
  for (const group of STAT_GROUPS) {
    for (const s of group.stats) {
      const best = Math.max(0, ...(peers || []).map((p) => Number(p[s.key]) || 0))
      barScale[s.label] = Math.max(best, Number(player[s.key]) || 0, 0.01)
    }
  }

  const barData = STAT_GROUPS.map((group) => ({
    label: group.label,
    data: group.stats.map((s) => ({
      stat: s.label,
      [player.player as string]: Number(player[s.key]) || 0,
    })),
  }))

  const name = player.player as string
  const keyStats = [
    {
      label: "Goals",
      value: String(player.goals),
      sub: `${Number(player.goals_p90).toFixed(2)} per 90`,
    },
    {
      label: "Assists",
      value: String(player.assists),
      sub: `${Number(player.assists_p90).toFixed(2)} per 90`,
    },
    {
      label: "xG",
      value: Number(player.xg).toFixed(1),
      sub: `${Number(player.xg_p90).toFixed(2)} per 90`,
    },
    {
      label: "Minutes",
      value: String(player.minutes),
      sub: `${player.appearances} appearances`,
    },
  ]

  const nameStr = String(player.player ?? "")
  const isYamal = /yamal/i.test(nameStr) || slug === "lamine-yamal"
  const isPedri = /\bpedri\b/i.test(nameStr) || slug === "pedri"

  return (
    <div className="relative mx-auto max-w-6xl px-3 sm:px-4 py-6 sm:py-10">
      {isYamal && <div className="yamal-bg" aria-hidden />}
      {isPedri && <div className="pedri-bg" aria-hidden />}
      <div className="relative z-10">
      <div className="mb-8 sm:mb-10 animate-fade-in flex flex-col sm:flex-row items-center sm:items-start text-center sm:text-left gap-4 sm:gap-5">
        <PlayerAvatar
          playerId={player.player_id as number}
          name={name}
          size={76}
        />
        <div className="min-w-0">
          <div className="flex items-center justify-center sm:justify-start gap-2.5 sm:gap-3 mb-2 flex-wrap">
            <h1
              className="text-3xl sm:text-5xl font-bold tracking-[-0.035em] leading-none"
              style={{ fontFamily: "var(--font-condensed)" }}
            >
              {name}
            </h1>
            <Badge
              variant="outline"
              className="stat-label border-white/15 bg-white/5"
            >
              {(player.role as string) || (player.position as string)}
            </Badge>
          </div>
          <p className="text-muted-foreground text-base flex items-center gap-2 flex-wrap">
            <TeamCrest
              teamId={player.team_id as number}
              name={player.team as string}
              size={20}
            />
            {player.team as string}
            <span className="opacity-40">·</span>
            {comp === "all" ? "All Competitions" : (player.league as string)}
            <span className="opacity-40">·</span>
            {player.season as string}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            {playsUcl && <CompetitionToggle />}
            <Link
              href={`/compare${scopeQuery(season, comp, { players: player.slug as string })}`}
              className="inline-flex items-center gap-1.5 text-sm font-medium hover:underline transition-colors"
              style={{ color: "var(--brand)" }}
            >
              Compare with another player
              <span className="text-xs">→</span>
            </Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10 stagger">
        {keyStats.map((s) => (
          <div
            key={s.label}
            className={`surface rounded-2xl px-4 py-5 text-center ${
              player.team === "FC Barcelona" ? "barca-stripes" : "bg-card"
            }`}
          >
            <div
              className="stat-figure text-4xl"
              style={{ color: "var(--pitch)" }}
            >
              {s.value}
            </div>
            <div className="stat-label mt-2">{s.label}</div>
            <div className="text-xs text-muted-foreground/60 mt-1">{s.sub}</div>
          </div>
        ))}
      </div>

      <Card className="surface mb-10 animate-slide-up border-0">
        <CardHeader>
          <CardTitle className="stat-label text-sm">
            Percentile Ranks
          </CardTitle>
          <p className="text-xs text-muted-foreground/70">
            vs. all {(player.role as string) || (player.position as string)}s
            · {player.league as string} · {player.season as string}
          </p>
        </CardHeader>
        <CardContent>
          <PlayerRadar data={radarData} players={[name]} />
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-6 stagger">
        {barData.map((group) => (
          <Card key={group.label} className="surface border-0">
            <CardHeader>
              <CardTitle className="stat-label text-sm">
                {group.label}
              </CardTitle>
              <p className="text-xs text-muted-foreground/60">per 90 minutes</p>
            </CardHeader>
            <CardContent>
              <StatBarChart data={group.data} players={[name]} scale={barScale} />
            </CardContent>
          </Card>
        ))}
      </div>
      </div>
    </div>
  )
}

export default function PlayerPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ season?: string; comp?: string }>
}) {
  return (
    <Suspense fallback={<Loading />}>
      <PlayerContent params={params} searchParams={searchParams} />
    </Suspense>
  )
}
