import { Suspense, ViewTransition } from "react"
import { cacheLife } from "next/cache"
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
import { BarcaSeason } from "@/components/barca-season"
import { Mosaic } from "@/components/mosaic"
import { Rondo } from "@/components/rondo"
import { SquadViewToggle } from "@/components/squad-view-toggle"
import { Simulator } from "@/components/simulator"
import { mostUsedXI } from "@/lib/barca"
import { loadFingerprints } from "@/components/player-dna"
import { DNA_KEYS, fingerprint, archetypes } from "@/lib/dna"

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
  role?: string | null
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

function PlayerCard({ p, scope, archetype }: { p: SquadRow; scope: string; archetype: string | null }) {
  const { first, last } = splitName(p.player)
  const portrait = SQUAD_PORTRAITS[p.slug]
  return (
    <Link
      href={`/player/${p.slug}${scope}`}
      className="squad-card shirt card-lift surface bg-card rounded-2xl overflow-hidden group"
    >
      <div className="shirt-inner">
      <div className="shirt-front flex flex-col h-full">
      <div className="relative aspect-[4/5] overflow-hidden">
        {/* Paired with the avatar on the player page: the portrait flies there. */}
        <ViewTransition name={`player-${p.player_id}`} share="morph" default="none">
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
        </ViewTransition>
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
      </div>

      {/* The back of the shirt: turned to on hover, where there is a pointer. */}
      <div className="shirt-back barca-stripes text-white" aria-hidden>
        <span
          className="text-lg font-bold uppercase tracking-[0.08em] leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]"
          style={{ fontFamily: "var(--font-condensed)" }}
        >
          {last}
        </span>
        <span
          className="text-[5.5rem] font-bold leading-[0.9] tabular-nums drop-shadow-[0_2px_4px_rgba(0,0,0,0.7)]"
          style={{ fontFamily: "var(--font-condensed)", color: "#EDBB00" }}
        >
          {portrait?.n ?? "–"}
        </span>
        {archetype && (
          <span className="stat-label !text-white rounded-full bg-black/45 px-2.5 py-1 mt-1">
            {archetype}
          </span>
        )}
        <span className="grid grid-cols-4 gap-x-3 mt-3 text-center tabular-nums drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
          {[
            [p.appearances ?? 0, "apps"],
            [p.goals ?? 0, "goals"],
            [p.assists ?? 0, "assists"],
            [Math.round(p.minutes ?? 0), "mins"],
          ].map(([v, label]) => (
            <span key={label}>
              <span className="block text-base font-bold leading-none" style={{ fontFamily: "var(--font-condensed)" }}>
                {v}
              </span>
              <span className="block text-[0.55rem] uppercase tracking-wider opacity-80 mt-1">{label}</span>
            </span>
          ))}
        </span>
      </div>
      </div>
    </Link>
  )
}

/** Where each line stands, top of the pitch to bottom, as a share of its height. */
const LINE_Y = { fwd: 15, mid: 40, def: 65, gk: 88 } as const

function Token({ p, scope, size, index }: { p: SquadRow; scope: string; size: number; index: number }) {
  const { last } = splitName(p.player)
  return (
    <Link
      href={`/player/${p.slug}${scope}`}
      className="pitch-token flex flex-col items-center gap-1 group"
      style={{ animationDelay: `${index * 45}ms` }}
    >
      {/* Same name as the card's portrait, so toggling the view walks each
          player from the grid to their spot, and on to their own page. */}
      <ViewTransition name={`player-${p.player_id}`} share="morph" default="none">
        <span className="rounded-full ring-2 ring-[#EDBB00]/80 shadow-[0_4px_14px_rgba(0,0,0,0.5)] transition-transform duration-200 group-hover:scale-110">
          <PlayerAvatar playerId={p.player_id} name={p.player} size={size} />
        </span>
      </ViewTransition>
      <span className="rounded-full bg-black/60 px-2 py-0.5 text-[0.65rem] sm:text-xs font-semibold text-white whitespace-nowrap leading-tight">
        <span className="text-[#EDBB00] tabular-nums mr-1">{SQUAD_PORTRAITS[p.slug]?.n ?? ""}</span>
        {last}
      </span>
    </Link>
  )
}

/** The most-used eleven set out in a 4-3-3, attack at the top, bench beneath. */
function SquadPitch({ squad, scope }: { squad: SquadRow[]; scope: string }) {
  const { lines, bench } = mostUsedXI(squad)
  let index = 0
  return (
    <div>
      <div className="pitch relative mx-auto max-w-3xl aspect-[5/6] sm:aspect-[4/3] rounded-2xl overflow-hidden">
        <div className="pitch-lines" aria-hidden>
          <span className="pitch-half" />
          <span className="pitch-circle" />
          <span className="pitch-box pitch-box-top" />
          <span className="pitch-box pitch-box-bottom" />
        </div>
        {lines.map((line) =>
          line.players.map((p, i) => (
            <div
              key={p.player_id}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{
                top: `${LINE_Y[line.key]}%`,
                left: `${((i + 1) / (line.players.length + 1)) * 100}%`,
              }}
            >
              <Token p={p} scope={scope} size={54} index={index++} />
            </div>
          )),
        )}
      </div>
      <p className="stat-label text-center mt-3">
        Most-used eleven by minutes, set out 4-3-3 · not a predicted line-up
      </p>
      {bench.length > 0 && (
        <>
          <h3 className="stat-label mt-6 mb-3 text-center">Bench</h3>
          <div className="flex flex-wrap justify-center gap-x-5 gap-y-4">
            {bench.map((p) => (
              <Token key={p.player_id} p={p} scope={scope} size={44} index={index++} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/** The squad for a season, combining all competitions (La Liga + UCL). Cached: changes twice a year. */
async function loadSquad(season: string) {
  "use cache"
  cacheLife("days")

  const { data } = await supabase
    .from("players")
    .select(
      "player, slug, player_id, position, detailed_position, league, minutes, appearances, goals, assists, role, team, team_id, " +
        // The style stats behind each card's archetype, from the league row.
        DNA_KEYS.map((k) => k.key).join(", "),
    )
    .eq("team", BARCA)
    .eq("season", season)
    .order("minutes", { ascending: false })

  // Players hold one row per competition (La Liga, Champions League).
  // Combine all competitions so the squad cards show their total goals, assists,
  // appearances, and minutes across the entire season.
  const groups = new Map<number, SquadRow[]>()
  for (const row of (data || []) as unknown as SquadRow[]) {
    const list = groups.get(row.player_id)
    if (list) list.push(row)
    else groups.set(row.player_id, [row])
  }

  const combined: SquadRow[] = []
  for (const group of groups.values()) {
    const base = group.find((r) => r.league !== UCL) ?? group[0]
    const appearances = group.reduce((t, r) => t + (r.appearances ?? 0), 0)
    const goals = group.reduce((t, r) => t + (r.goals ?? 0), 0)
    const assists = group.reduce((t, r) => t + (r.assists ?? 0), 0)
    const minutes = group.reduce((t, r) => t + (r.minutes ?? 0), 0)

    combined.push({
      ...base,
      appearances,
      goals,
      assists,
      minutes,
      position: squadPosition(base.slug, base.position),
    })
  }

  return combined
}

async function Squad({
  searchParams,
}: {
  searchParams: Promise<{ season?: string; pos?: string; view?: string }>
}) {
  const sp = await searchParams
  const season = resolveSeason(sp.season)
  const pitch = sp.view === "pitch"
  const pos = pitch ? "all" : resolvePosition(sp.pos)
  const scope = sp.season ? `?season=${encodeURIComponent(season)}` : ""
  const [squad, { scale }] = await Promise.all([loadSquad(season), loadFingerprints(season, "league")])
  // Style needs a real sample, and keepers have no outfield style to name.
  const archetype = (p: SquadRow) =>
    p.position === "Goalkeeper" || p.minutes < 270
      ? null
      : archetypes(fingerprint(p as unknown as Record<string, unknown>, scale))[0].name
  const bucket = bucketFor(pos)
  const shown = bucket ? squad.filter((p) => p.position === bucket) : squad

  // Attackers first, then midfielders, defenders, and goalkeepers.
  const order = SQUAD_POSITIONS.map((p) => p.bucket).filter(Boolean) as string[]
  shown.sort(
    (a, b) =>
      order.indexOf(a.position) - order.indexOf(b.position) ||
      b.minutes - a.minutes,
  )

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <SquadViewToggle active={pitch ? "pitch" : "cards"} />
        {!pitch && <SquadPositionFilter active={pos} />}
        <span className="text-xs text-muted-foreground">
          {shown.length} player{shown.length === 1 ? "" : "s"} · {season}
        </span>
      </div>
      {pitch ? (
        <SquadPitch squad={squad} scope={scope} />
      ) : shown.length === 0 ? (
        <p className="text-muted-foreground">No players in this position for {season}.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-4 stagger">
          {shown.map((p) => (
            <PlayerCard key={p.player_id} p={p} scope={scope} archetype={archetype(p)} />
          ))}
        </div>
      )}
    </>
  )
}

export default function SquadPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string; pos?: string; view?: string }>
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
      <Mosaic />
      <Simulator
        nav={
          <Suspense fallback={<Skeleton className="h-10 w-44 rounded-full" />}>
            <BarcaNav />
          </Suspense>
        }
      />
      <Suspense fallback={<Rondo label="Reading the season" className="h-[230px] mb-8" />}>
        <BarcaSeason searchParams={searchParams} />
      </Suspense>
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
