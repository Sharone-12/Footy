"use client"

import { useEffect, useState, useMemo } from "react"
import Link from "next/link"
import { PlayIcon, TvIcon } from "lucide-react"
import { TeamCrest, LeagueCrest } from "@/components/player-avatar"
import { LEAGUE_TOURNAMENT_ID, getLeagueTournamentId, isPredictable, isTop10FifaMatch } from "@/lib/teams"
import { splitFixtures, startOf, PLAYING_MS, type Timed } from "@/lib/live"
import { StreamingNetworkHealth } from "@/components/streaming-network-health"
import type { MatchedStream } from "@/lib/streamfree/types"
import type { MatchedZLive, ZLiveChannel } from "@/lib/zlive/types"
import type { MatchedDaddyLive } from "@/lib/daddylive/types"
import type { MatchedDamiTv } from "@/lib/damitv/types"
import type { MatchedCinevid } from "@/lib/cinevid/types"
import type { MatchedLive24 } from "@/lib/live24/types"
import type { MatchedMatchora } from "@/lib/matchora/types"
import { isProviderEnabled } from "@/lib/streaming/config"
import type { LiveStreams } from "@/lib/streaming/live-streams"
import { UnifiedPlayer } from "@/components/unified-player"
import { formatKickoffIST, formatDateIST, formatTimeIST, IST_TIMEZONE } from "@/lib/time"
import { LiveCard } from "@/components/live-card"
import { LiveBadge, KickoffCountdown } from "@/components/live-signal"
import { LiveFixtureMark } from "@/components/live-score"

export type LiveFixture = Timed & {
  event_id: number
  league: string
  home: string
  home_id: number | null
  away: string
  away_id: number | null
  /** Matchday, as `matches.round`. Optional: only the pages that show it select it. */
  round?: number | null
  home_goals?: number | null
  away_goals?: number | null
  status?: string | null
}

function formatKickoff(m: LiveFixture) {
  return formatKickoffIST(m.kickoff, m.date)
}

const dayKey = (ms: number) => new Date(ms).toLocaleDateString("en-CA", { timeZone: IST_TIMEZONE })

/**
 * Fixtures bucketed by the day they kick off, in the same timezone the times
 * are shown in, so a 01:15 kickoff sits under the day it reads as.
 */
function groupByDay(rows: LiveFixture[], now: number) {
  const today = dayKey(now)
  const tomorrow = dayKey(now + 86_400_000)
  const days: { key: string; label: string; rows: LiveFixture[] }[] = []
  for (const m of rows) {
    const start = startOf(m)
    const key = dayKey(start)
    let day = days.find((d) => d.key === key)
    if (!day) {
      const date = formatDateIST(start, { weekday: "long", day: "numeric", month: "short" })
      day = { key, label: key === today ? `Today · ${date}` : key === tomorrow ? `Tomorrow · ${date}` : date, rows: [] }
      days.push(day)
    }
    day.rows.push(m)
  }
  return days
}

type ActivePlayerState = {
  fixtureTitle: string
  league?: string
  matchora?: MatchedMatchora | null
  streamFree?: MatchedStream | null
  zLive?: MatchedZLive | null
  daddyLive?: MatchedDaddyLive | null
  damiTv?: MatchedDamiTv | null
  cinevid?: MatchedCinevid | null
  live24?: MatchedLive24 | null
  genericChannel?: ZLiveChannel | null
  initialProvider?: "matchora" | "streamfree" | "zlive" | "daddylive" | "damitv" | "cinevid" | "live24"
}

/**
 * Provider badges.
 *
 * These were seven hand-written <span> blocks that differed only in icon,
 * colour and label, so a styling change meant seven edits and they had
 * already drifted apart. One row per provider now; the markup exists once.
 */
type PillSpec = {
  id: Parameters<typeof isProviderEnabled>[0]
  label: string
  /**
   * Full class string, never interpolated: Tailwind's JIT only emits classes
   * it can find whole in the source, so `bg-${hue}-500/10` compiles to
   * nothing and the pill loses its colour.
   */
  tone: string
}

const PILLS: PillSpec[] = [
  { id: "cinevid", label: "Cinevid", tone: "bg-rose-500/15 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-300 dark:border-rose-500/25" },
  { id: "damitv", label: "DAMITV", tone: "bg-violet-500/15 dark:bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-300 dark:border-violet-500/25" },
  { id: "matchora", label: "Matchora", tone: "bg-blue-500/15 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-300 dark:border-blue-500/25" },
  { id: "daddylive", label: "DaddyLive", tone: "bg-amber-500/15 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-500/25" },
  { id: "live24", label: "Live24", tone: "bg-emerald-500/15 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-500/25" },
  { id: "zlive", label: "ZLive", tone: "bg-emerald-500/15 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-500/25" },
  { id: "streamfree", label: "StreamFree", tone: "bg-cyan-500/15 dark:bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-300 dark:border-cyan-500/25" },
]

/** Plural-safe "3 channels" / "1 channel", used in the badge tooltips. */
const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`

function providerPills(m: {
  matchedMatchora?: MatchedMatchora
  matchedDamiTv?: MatchedDamiTv
  matchedCinevid?: MatchedCinevid
  matchedLive24?: MatchedLive24
  matchedStream?: MatchedStream
  matchedZLive?: MatchedZLive
  matchedDaddyLive?: MatchedDaddyLive
}) {
  // Tooltip and trailing count are the only per-provider differences left.
  const state: Record<string, { on: boolean; title: string; extra?: number }> = {
    matchora: {
      on: Boolean(m.matchedMatchora),
      title: `Matchora (${count(m.matchedMatchora?.event.channelCount ?? 0, "channel")})`,
    },
    damitv: {
      on: Boolean(m.matchedDamiTv),
      title: `DAMITV (${count(m.matchedDamiTv?.stream.sources.length ?? 0, "source")})`,
    },
    cinevid: {
      on: Boolean(m.matchedCinevid),
      title: `Cinevid (${m.matchedCinevid?.isConfirmedMatch ? "Confirmed" : "Candidate"})`,
    },
    live24: {
      on: Boolean(m.matchedLive24),
      title: `Live24 (${count(m.matchedLive24?.event.streams.length ?? 0, "stream")})`,
    },
    streamfree: { on: Boolean(m.matchedStream), title: "StreamFree source available" },
    zlive: {
      on: Boolean(m.matchedZLive?.isConfirmedMatch),
      title: "ZLive match confirmed",
    },
    daddylive: {
      on: Boolean(m.matchedDaddyLive),
      title: `DaddyLiveHD (${count(m.matchedDaddyLive?.channels.length ?? 0, "channel")})`,
      extra: m.matchedDaddyLive && m.matchedDaddyLive.channels.length > 1
        ? m.matchedDaddyLive.channels.length
        : undefined,
    },
  }

  return PILLS.filter((p) => isProviderEnabled(p.id) && state[p.id]?.on).map(
    ({ id, label, tone }) => (
      <span
        key={id}
        title={state[id].title}
        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[0.65rem] font-semibold border ${tone}`}
      >
        {label}
        {state[id].extra != null && (
          <span className="text-[10px] opacity-75">({state[id].extra})</span>
        )}
      </span>
    ),
  )
}

/**
 * The fixture half of a row. A link to its prediction breakdown, unless the
 * competition is one we hold no table for — an international has no
 * prediction to open, so it should not look tappable.
 */
function FixtureLink({
  eventId,
  league,
  children,
}: {
  eventId: number
  league: string
  children: React.ReactNode
}) {
  const className = "flex items-center gap-3 sm:gap-4 min-w-0 flex-1 group"
  return isPredictable(league) ? (
    <Link href={`/predictions/match?id=${eventId}`} className={className}>
      {children}
    </Link>
  ) : (
    <span className={className}>{children}</span>
  )
}

function Row({
  m,
  now,
  live,
  matchedMatchora,
  matchedStream,
  matchedZLive,
  matchedDaddyLive,
  matchedDamiTv,
  matchedCinevid,
  matchedLive24,
  loadingStreams,
  onWatch,
  timeOnly,
}: {
  m: LiveFixture
  now: number
  live: boolean
  /** Under a day header the date is already said; show the time alone. */
  timeOnly?: boolean
  matchedMatchora?: MatchedMatchora
  matchedStream?: MatchedStream
  matchedZLive?: MatchedZLive
  matchedDaddyLive?: MatchedDaddyLive
  matchedDamiTv?: MatchedDamiTv
  matchedCinevid?: MatchedCinevid
  matchedLive24?: MatchedLive24
  loadingStreams?: boolean
  onWatch?: (state: ActivePlayerState) => void
}) {
  const tid = getLeagueTournamentId(m.league)
  const hasStream = Boolean(
    (isProviderEnabled("matchora") && matchedMatchora) ||
    (isProviderEnabled("streamfree") && matchedStream) ||
    (isProviderEnabled("zlive") && matchedZLive?.isConfirmedMatch) ||
    (isProviderEnabled("daddylive") && matchedDaddyLive) ||
    (isProviderEnabled("damitv") && matchedDamiTv) ||
    (isProviderEnabled("cinevid") && matchedCinevid) ||
    (isProviderEnabled("live24") && matchedLive24)
  )
  const start = startOf(m)
  const left = start - now
  const isUnderAnHour = left > 0 && left <= 3600_000

  // Watch CTA & stream badges are available when the match is LIVE or within 15 minutes of kickoff
  const isWatchable = live || (left <= 15 * 60_000 && now - start < PLAYING_MS)

  return (
    <div className="card-lift fixture-row surface bg-card rounded-2xl px-4 py-3.5 flex flex-col gap-3 transition-all">
      {/* Line 1 — time, the fixture itself, competition.
          Kept on its own row so the club names get the full width: with
          seven provider badges sharing one line they were truncating to
          "L…" and "Tott…" on a 2000px display. */}
      <div className="flex items-center gap-3 sm:gap-4">
        <FixtureLink eventId={m.event_id} league={m.league}>
          <span className={`flex flex-col leading-none shrink-0 ${timeOnly ? "w-12 sm:w-14" : "w-20 sm:w-24"}`}>
            {live ? (
              <LiveBadge />
            ) : isUnderAnHour ? (
              <KickoffCountdown msLeft={left} />
            ) : (
              <span className="stat-figure text-sm text-muted-foreground font-medium">
                {timeOnly ? (m.kickoff ? formatTimeIST(m.kickoff) : "TBC") : formatKickoff(m)}
              </span>
            )}
          </span>
          <span className="flex items-center gap-2 min-w-0 flex-1">
            {m.home_id != null && <TeamCrest teamId={m.home_id} name={m.home} size={26} />}
            <span className="truncate font-semibold text-[0.9rem] group-hover:text-[var(--pitch)] transition-colors">
              {m.home}
            </span>
            <span className="stat-label text-[0.6rem] shrink-0 text-muted-foreground">v</span>
            {m.away_id != null && <TeamCrest teamId={m.away_id} name={m.away} size={26} />}
            <span className="truncate font-semibold text-[0.9rem] group-hover:text-[var(--pitch)] transition-colors">
              {m.away}
            </span>
          </span>
        </FixtureLink>

        <div className="flex items-center gap-2 shrink-0">
          <LiveFixtureMark fixture={m} />
          {tid && <LeagueCrest tournamentId={tid} name={m.league} size={22} />}
          <span className="hidden sm:inline text-xs font-medium text-muted-foreground truncate max-w-[130px]">
            {m.league}
          </span>
        </div>
      </div>

      {/* Line 2 — sources and the CTA. Rendered when the match is live or within 15 minutes */}
      {isWatchable && (
        <div className="flex items-center justify-between gap-3 flex-wrap pt-2.5 border-t border-border/50">
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            {hasStream ? (
              providerPills({
                matchedMatchora,
                matchedDamiTv,
                matchedCinevid,
                matchedLive24,
                matchedStream,
                matchedZLive,
                matchedDaddyLive,
              })
            ) : loadingStreams ? (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted/60 text-muted-foreground border border-border/40 animate-pulse">
                <span className="size-1.5 rounded-full bg-emerald-500 animate-ping" />
                Finding streams...
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold border bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                Live Broadcast
              </span>
            )}
          </div>

          <Link
            href={`/live/watch?id=${m.event_id}`}
            aria-label={`Watch stream for ${m.home} vs ${m.away}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#16a34a] text-white dark:bg-[var(--pitch)] dark:text-black hover:bg-[#15803d] dark:hover:brightness-110 font-bold text-xs shadow-md transition-all hover:scale-[1.03] shrink-0 cursor-pointer"
          >
            <PlayIcon className="size-3 fill-current" />
            Watch Now
          </Link>
        </div>
      )}
    </div>
  )
}

function Section({
  title,
  rows,
  now,
  live,
  empty,
  matchoraMap,
  streamMap,
  zliveMap,
  daddyliveMap,
  damitvMap,
  cinevidMap,
  live24Map,
  loadingStreams,
  onWatch,
}: {
  title: string
  rows: LiveFixture[]
  now: number
  live?: boolean
  empty: string
  matchoraMap: Record<number, MatchedMatchora>
  streamMap: Record<number, MatchedStream>
  zliveMap: Record<number, MatchedZLive>
  daddyliveMap: Record<number, MatchedDaddyLive>
  damitvMap: Record<number, MatchedDamiTv>
  cinevidMap: Record<number, MatchedCinevid>
  live24Map: Record<number, MatchedLive24>
  loadingStreams?: boolean
  onWatch?: (state: ActivePlayerState) => void
}) {
  return (
    <section>
      <div className="flex items-center justify-between mb-2.5">
        <h2
          className="text-lg font-semibold tracking-tight uppercase"
          style={{ fontFamily: "var(--font-condensed)" }}
        >
          {title}
        </h2>
        {rows.length > 0 && (
          <span className="text-xs text-muted-foreground tabular-nums">
            {rows.length} match{rows.length === 1 ? "" : "es"}
          </span>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">{empty}</p>
      ) : (
        <div className="flex flex-col gap-2.5 stagger">
          {rows.map((m) => (
            <Row
              key={m.event_id}
              m={m}
              now={now}
              live={Boolean(live)}
              matchedMatchora={matchoraMap[m.event_id]}
              matchedStream={streamMap[m.event_id]}
              matchedZLive={zliveMap[m.event_id]}
              matchedDaddyLive={daddyliveMap[m.event_id]}
              matchedDamiTv={damitvMap[m.event_id]}
              matchedCinevid={cinevidMap[m.event_id]}
              matchedLive24={live24Map[m.event_id]}
              loadingStreams={loadingStreams}
              onWatch={onWatch}
            />
          ))}
        </div>
      )}
    </section>
  )
}

type StreamMaps = {
  matchoraMap: Record<number, MatchedMatchora>
  streamMap: Record<number, MatchedStream>
  zliveMap: Record<number, MatchedZLive>
  daddyliveMap: Record<number, MatchedDaddyLive>
  damitvMap: Record<number, MatchedDamiTv>
  cinevidMap: Record<number, MatchedCinevid>
  live24Map: Record<number, MatchedLive24>
}

const EMPTY_MAPS: StreamMaps = {
  matchoraMap: {}, streamMap: {}, zliveMap: {}, daddyliveMap: {},
  damitvMap: {}, cinevidMap: {}, live24Map: {},
}

const byId = <T extends { event_id: number }>(rows: T[] | undefined): Record<number, T> =>
  Object.fromEntries((rows ?? []).map((r) => [r.event_id, r]))

/** Matches the route's s-maxage, so a re-poll is a CDN hit, not a fan-out. */
const STREAMS_EVERY_MS = 60_000

export function LiveSections({ matches }: { matches: LiveFixture[] }) {
  const [now, setNow] = useState<number | null>(null)
  const [loadedMaps, setMaps] = useState<StreamMaps>(EMPTY_MAPS)
  const [loadingStreams, setLoadingStreams] = useState<boolean>(true)
  const [genericChannels, setGenericChannels] = useState<ZLiveChannel[]>([])
  const [activePlayer, setActivePlayer] = useState<ActivePlayerState | null>(null)

  useEffect(() => {
    const tick = () => setNow(Date.now())
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [])

  // Only fetch streams when at least one fixture is live or within 15 minutes of kickoff.
  // When a match reaches the 15-minute window, streamEligibleKey updates and streams are fetched.
  const streamEligibleKey = useMemo(() => {
    const currentNow = now ?? Date.now()
    return matches
      .filter((m) => {
        const start = startOf(m)
        const left = start - currentNow
        return left <= 15 * 60_000 && currentNow - start < PLAYING_MS
      })
      .map((m) => m.event_id)
      .sort()
      .join(",")
  }, [matches, now])

  // Every provider in one request, only while a match is live or within 15
  // minutes of kickoff. This was seven routes, each with its own Supabase
  // query and matching pass; the server now does that once and the CDN holds
  // it for the re-poll window, so pills appear as sources come online.
  useEffect(() => {
    if (!streamEligibleKey) {
      setLoadingStreams(false)
      return
    }
    let unmounted = false
    setLoadingStreams(true)
    async function load() {
      try {
        const res = await fetch("/api/streams/live")
        if (!res.ok) return
        const data = (await res.json()) as LiveStreams
        if (unmounted) return
        setMaps({
          matchoraMap: byId(data.matchora),
          streamMap: byId(data.streamfree),
          zliveMap: byId(data.zlive),
          daddyliveMap: byId(data.daddylive),
          damitvMap: byId(data.damitv),
          cinevidMap: byId(data.cinevid),
          live24Map: byId(data.live24),
        })
      } catch (err) {
        console.warn("[live] Could not load streams:", err)
      } finally {
        if (!unmounted) setLoadingStreams(false)
      }
    }
    load()
    const t = setInterval(() => {
      if (document.visibilityState === "visible") load()
    }, STREAMS_EVERY_MS)
    return () => {
      unmounted = true
      clearInterval(t)
    }
  }, [streamEligibleKey])

  // The 24/7 channel directory sits below the fixtures whatever is on.
  useEffect(() => {
    if (!isProviderEnabled("zlive")) return
    let unmounted = false
    fetch("/api/zlive?generic=1")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!unmounted && Array.isArray(data?.channels)) setGenericChannels(data.channels)
      })
      .catch((err) => console.warn("[live] Could not load ZLive channels:", err))
    return () => {
      unmounted = true
    }
  }, [])

  // Close player with Esc key
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setActivePlayer(null)
    }
    if (activePlayer) {
      window.addEventListener("keydown", onKeyDown)
      return () => window.removeEventListener("keydown", onKeyDown)
    }
  }, [activePlayer])

  const filteredMatches = useMemo(() => matches.filter(isTop10FifaMatch), [matches])

  // Before mount there is no clock, so nothing can be bucketed yet.
  const { live, soon, upcoming } = splitFixtures(filteredMatches, now ?? 0)

  // Nothing in the window means nothing to show, whatever an earlier load held.
  const maps = streamEligibleKey ? loadedMaps : EMPTY_MAPS
  const matched = (m: LiveFixture) => ({
    matchedMatchora: maps.matchoraMap[m.event_id],
    matchedStream: maps.streamMap[m.event_id],
    matchedZLive: maps.zliveMap[m.event_id],
    matchedDaddyLive: maps.daddyliveMap[m.event_id],
    matchedDamiTv: maps.damitvMap[m.event_id],
    matchedCinevid: maps.cinevidMap[m.event_id],
    matchedLive24: maps.live24Map[m.event_id],
  })
  const ready = now != null
  const days = ready ? groupByDay(upcoming, now) : []
  const next = soon[0] ?? upcoming[0]

  return (
    <div className="flex flex-col gap-8 relative">
      {/* 1. In play: big cards, and only when something is. */}
      {ready && live.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-2.5">
            <h2
              className="text-lg font-semibold tracking-tight uppercase"
              style={{ fontFamily: "var(--font-condensed)" }}
            >
              Live Now
            </h2>
            <span className="text-xs text-muted-foreground tabular-nums">
              {live.length} match{live.length === 1 ? "" : "es"}
            </span>
          </div>
          <div className="grid md:grid-cols-2 gap-3 stagger">
            {live.map((m) => {
              const mm = matched(m)
              return (
                <LiveCard
                  key={m.event_id}
                  m={m}
                  watchable={true}
                  loadingStreams={loadingStreams}
                  pills={providerPills(mm)}
                />
              )
            })}
          </div>
        </section>
      )}

      {/* With nothing on, one line says so and points at what is next,
          rather than two empty sections pushing the fixtures down. */}
      {ready && live.length === 0 && soon.length === 0 && (
        <p className="surface bg-card rounded-2xl px-4 py-3 text-sm text-muted-foreground">
          No match in play right now.
          {next && (
            <>
              {" "}Next up: <b className="text-foreground">{next.home} v {next.away}</b>, {formatKickoff(next)}.
            </>
          )}
        </p>
      )}

      {/* 2. Kicking off within three hours */}
      {ready && soon.length > 0 && (
        <Section title="Starting Soon" rows={soon} now={now} empty="" loadingStreams={loadingStreams} {...maps} />
      )}

      {/* 3. Everything later, a day at a time under a header that stays put. */}
      {days.map((day) => (
        <section key={day.key}>
          <div className="day-header sticky top-[6.75rem] md:top-[4.75rem] z-10 flex items-center justify-between mb-2.5 py-1.5">
            <h2
              className="nav-pill px-3.5 py-1 text-sm font-semibold tracking-tight uppercase"
              style={{ fontFamily: "var(--font-condensed)" }}
            >
              {day.label}
            </h2>
            <span className="text-xs text-muted-foreground tabular-nums">
              {day.rows.length} match{day.rows.length === 1 ? "" : "es"}
            </span>
          </div>
          <div className="flex flex-col gap-2.5">
            {day.rows.map((m) => (
              <Row key={m.event_id} m={m} now={now ?? 0} live={false} timeOnly loadingStreams={loadingStreams} {...matched(m)} />
            ))}
          </div>
        </section>
      ))}
      {ready && days.length === 0 && live.length === 0 && soon.length === 0 && (
        <p className="text-muted-foreground text-sm">No upcoming fixtures.</p>
      )}

      {/* 4. 24/7 Football TV Channels (ZLive) - Pushed below matches */}
      {genericChannels.length > 0 && (
        <section aria-label="Football TV Channels" className="pt-4 border-t border-border/40">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <TvIcon className="size-4 text-emerald-400" />
              <h2
                className="text-lg font-semibold tracking-tight uppercase"
                style={{ fontFamily: "var(--font-condensed)" }}
              >
                Football TV Channels (ZLive)
              </h2>
            </div>
            <span className="text-xs text-muted-foreground tabular-nums">
              {genericChannels.length} 24/7 channels
            </span>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Direct 24/7 football broadcasters available for manual selection alongside match streams.
          </p>
          <div className="flex flex-wrap gap-2">
            {genericChannels.slice(0, 12).map((ch) => (
              <Link
                key={ch.id}
                href={`/live/watch?channel=${ch.id}&provider=zlive`}
                className="card-lift surface bg-card hover:bg-accent/40 border border-border/70 hover:border-emerald-500/50 px-3 py-1.5 rounded-xl flex items-center gap-2 text-xs transition-all group"
              >
                <span className="relative flex size-1.5 shrink-0">
                  <span className="relative inline-flex rounded-full size-1.5 bg-emerald-400" />
                </span>
                <span className="font-semibold text-foreground group-hover:text-emerald-300 transition-colors">
                  {ch.name}
                </span>
                {ch.quality && (
                  <span className="text-[10px] px-1 rounded bg-black/40 text-muted-foreground font-mono">
                    {ch.quality}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 5. Streaming Network Health Monitor (Real-time latency & active provider pings) */}
      <StreamingNetworkHealth />
    </div>
  )
}
