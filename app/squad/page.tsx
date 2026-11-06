import { Suspense } from "react"
import Link from "next/link"
import Image from "next/image"
import { supabase } from "@/lib/supabase"
import { resolveSeason } from "@/lib/seasons"
import { BARCA_ID } from "@/lib/teams"
import { UCL } from "@/lib/competition"
import {
  bucketFor,
  resolvePosition,
  splitName,
  squadPosition,
  SQUAD_POSITIONS,
} from "@/lib/squad"
import { PlayerAvatar, TeamCrest } from "@/components/player-avatar"
import { SQUAD_PORTRAITS } from "@/lib/squad-portraits"
import { squadPortrait } from "@/lib/images"
import { SquadPositionFilter } from "@/components/squad-position-filter"
import { BarcaNav } from "@/components/barca-nav"
import { Skeleton } from "@/components/ui/skeleton"

const BARCA = "FC Barcelona"

type SquadRow = {
  player: string
  slug: string
  player_id: number
  position: string
  detailed_position: string | null
  league: string
  minutes: number
  appearances: number | null
  goals: number | null
  assists: number | null
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-[268px] rounded-2xl" />
      ))}
    </div>
  )
}

function PlayerCard({ p, scope }: { p: SquadRow; scope: string }) {
  const { first, last } = splitName(p.player)
  const portrait = SQUAD_PORTRAITS[p.slug]
  return (
    <Link
      href={`/player/${p.slug}${scope}`}
      className="squad-card card-lift surface bg-card rounded-2xl overflow-hidden flex flex-col group"
    >
      <div className="relative aspect-[4/5] overflow-hidden">
        {portrait ? (
          /* next/image, unlike the headshots elsewhere: these are ~700 KB
             PNGs and the optimizer serves a ~25 KB webp at card size. */
          <Image
            src={squadPortrait(portrait.src)}
            alt={p.player}
            width={480}
            height={600}
            sizes="(min-width: 1024px) 268px, (min-width: 640px) 33vw, 50vw"
            className="relative h-full w-full object-contain object-bottom transition-transform duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="relative h-full flex items-center justify-center">
            <PlayerAvatar playerId={p.player_id} name={p.player} size={104} />
          </div>
        )}
      </div>
      <div className="border-t border-border px-3.5 py-3 flex items-center gap-3">
        <span
          className="text-3xl font-bold leading-none tabular-nums text-muted-foreground/70 w-8 shrink-0"
          style={{ fontFamily: "var(--font-condensed)" }}
        >
          {portrait?.n ?? ""}
        </span>
        <span className="min-w-0 flex-1">
          {first && <span className="stat-label block truncate">{first}</span>}
          <span
            className="block text-xl font-bold uppercase tracking-[-0.02em] leading-tight truncate"
            style={{ fontFamily: "var(--font-condensed)" }}
          >
            {last}
          </span>
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {squadPosition(p.slug, p.position)}
        </span>
      </div>
      <div className="px-3.5 pb-3 flex items-center gap-3 text-xs text-muted-foreground tabular-nums">
        <span>{p.appearances ?? 0} apps</span>
        <span>{p.goals ?? 0} G</span>
        <span>{p.assists ?? 0} A</span>
      </div>
    </Link>
  )
}

async function Squad({
  searchParams,
}: {
  searchParams: Promise<{ season?: string; pos?: string }>
}) {
  const sp = await searchParams
  const season = resolveSeason(sp.season)
  const pos = resolvePosition(sp.pos)
  const scope = sp.season ? `?season=${encodeURIComponent(season)}` : ""

  const { data } = await supabase
    .from("players")
    .select(
      "player, slug, player_id, position, detailed_position, league, minutes, appearances, goals, assists",
    )
    .eq("team", BARCA)
    .eq("season", season)
    .order("minutes", { ascending: false })

  // A player holds one row per competition. Keep the domestic one — the
  // Champions League row is a handful of games and would read as a whole
  // season's return on the card.
  const byPlayer = new Map<number, SquadRow>()
  for (const row of (data || []) as SquadRow[]) {
    const kept = byPlayer.get(row.player_id)
    if (!kept || (kept.league === UCL && row.league !== UCL)) {
      byPlayer.set(row.player_id, row)
    }
  }

  const squad = [...byPlayer.values()].map((p) => ({
    ...p,
    position: squadPosition(p.slug, p.position),
  }))
  const bucket = bucketFor(pos)
  const shown = bucket ? squad.filter((p) => p.position === bucket) : squad

  // Keepers first, then out from the back, as a team sheet reads.
  const order = SQUAD_POSITIONS.map((p) => p.bucket).filter(Boolean) as string[]
  shown.sort(
    (a, b) =>
      order.indexOf(a.position) - order.indexOf(b.position) ||
      b.minutes - a.minutes,
  )

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <SquadPositionFilter active={pos} />
        <span className="text-xs text-muted-foreground">
          {shown.length} player{shown.length === 1 ? "" : "s"} · {season}
        </span>
      </div>
      {shown.length === 0 ? (
        <p className="text-muted-foreground">No players in this position for {season}.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-4 stagger">
          {shown.map((p) => (
            <PlayerCard key={p.player_id} p={p} scope={scope} />
          ))}
        </div>
      )}
    </>
  )
}

export default function SquadPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string; pos?: string }>
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
            SQUAD
          </h1>
          <p className="text-muted-foreground text-xs sm:text-sm mt-1 leading-snug">
            Every Barça player we hold stats for. Tap one for their full profile.
          </p>
        </div>
      </div>
      <div className="mb-6">
        <Suspense fallback={<Skeleton className="h-10 w-44 rounded-full" />}>
          <BarcaNav />
        </Suspense>
      </div>
      <Suspense
        fallback={
          <>
            <Skeleton className="h-10 w-80 rounded-full mb-6" />
            <GridSkeleton />
          </>
        }
      >
        <Squad searchParams={searchParams} />
      </Suspense>
    </div>
  )
}
