"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { PlayIcon, TvIcon } from "lucide-react"
import { TeamCrest, LeagueCrest } from "@/components/player-avatar"
import { LEAGUE_TOURNAMENT_ID } from "@/lib/teams"
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
import { UnifiedPlayer } from "@/components/unified-player"
import { formatKickoffIST } from "@/lib/time"
import { LiveBadge, KickoffCountdown } from "@/components/live-signal"

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
  { id: "damitv", label: "DAMITV", tone: "bg-violet-500/10 text-violet-400 border-violet-500/25" },
  { id: "live24", label: "Live24", tone: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25" },
  { id: "cinevid", label: "Cinevid", tone: "bg-rose-500/10 text-rose-400 border-rose-500/25" },
  { id: "matchora", label: "Matchora", tone: "bg-blue-500/10 text-blue-400 border-blue-500/25" },
  { id: "daddylive", label: "DaddyLive", tone: "bg-amber-500/10 text-amber-400 border-amber-500/25" },
  { id: "zlive", label: "ZLive", tone: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25" },
  { id: "streamfree", label: "StreamFree", tone: "bg-cyan-500/10 text-cyan-400 border-cyan-500/25" },
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
      on: Boolean(m.matchedZLive),
      title: m.matchedZLive?.isConfirmedMatch ? "ZLive match confirmed" : "ZLive broadcast channel",
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
  onWatch,
}: {
  m: LiveFixture
  now: number
  live: boolean
  matchedMatchora?: MatchedMatchora
  matchedStream?: MatchedStream
  matchedZLive?: MatchedZLive
  matchedDaddyLive?: MatchedDaddyLive
  matchedDamiTv?: MatchedDamiTv
  matchedCinevid?: MatchedCinevid
  matchedLive24?: MatchedLive24
  onWatch?: (state: ActivePlayerState) => void
}) {
  const tid = LEAGUE_TOURNAMENT_ID[m.league]
  const hasStream = Boolean(
    (isProviderEnabled("matchora") && matchedMatchora) ||
    (isProviderEnabled("streamfree") && matchedStream) ||
    (isProviderEnabled("zlive") && matchedZLive) ||
    (isProviderEnabled("daddylive") && matchedDaddyLive) ||
    (isProviderEnabled("damitv") && matchedDamiTv) ||
    (isProviderEnabled("cinevid") && matchedCinevid) ||
    (isProviderEnabled("live24") && matchedLive24)
  )
  const start = startOf(m)
  const left = start - now
  const isUnderAnHour = left > 0 && left <= 3600_000

  // Watch CTA & stream badges are only available when the match is LIVE or within 15 minutes of kickoff
  const isWatchable =
    hasStream &&
    (live || (left <= 15 * 60_000 && now - start < PLAYING_MS))

  return (
    <div className="card-lift fixture-row surface bg-card rounded-2xl px-4 py-3.5 flex flex-col gap-3 transition-all">
      {/* Line 1 — time, the fixture itself, competition.
          Kept on its own row so the club names get the full width: with
          seven provider badges sharing one line they were truncating to
          "L…" and "Tott…" on a 2000px display. */}
      <div className="flex items-center gap-3 sm:gap-4">
        <Link
          href={`/predictions/match?id=${m.event_id}`}
          className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1 group"
        >
          <span className="flex flex-col leading-none w-20 sm:w-24 shrink-0">
            {live ? (
              <LiveBadge />
            ) : isUnderAnHour ? (
              <KickoffCountdown msLeft={left} />
            ) : (
              <span className="stat-figure text-sm text-muted-foreground font-medium">
                {formatKickoff(m)}
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
        </Link>

        <div className="flex items-center gap-2 shrink-0">
          <span className="hidden sm:inline text-xs text-muted-foreground truncate max-w-[130px]">
            {m.league}
          </span>
          {tid && <LeagueCrest tournamentId={tid} name={m.league} size={20} />}
        </div>
      </div>

      {/* Line 2 — sources and the CTA. Only rendered when the match is live
          or within 15 minutes, so a row with nothing to watch keeps its
          original height and the section does not grow for no reason. */}
      {isWatchable && (
        <div className="flex items-center justify-between gap-3 flex-wrap pt-2.5 border-t border-border/50">
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            {providerPills({
              matchedMatchora,
              matchedDamiTv,
              matchedCinevid,
              matchedLive24,
              matchedStream,
              matchedZLive,
              matchedDaddyLive,
            })}
          </div>

          <Link
            href={`/live/watch?id=${m.event_id}`}
            aria-label={`Watch stream for ${m.home} vs ${m.away}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--pitch)] text-black hover:brightness-110 font-bold text-xs shadow-md transition-all hover:scale-[1.03] shrink-0"
          >
            <PlayIcon className="size-3 fill-current" />
            Watch
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
              onWatch={onWatch}
            />
          ))}
        </div>
      )}
    </section>
  )
}

export function LiveSections({ matches }: { matches: LiveFixture[] }) {
  const [now, setNow] = useState<number | null>(null)
  const [matchoraMap, setMatchoraMap] = useState<Record<number, MatchedMatchora>>({})
  const [streamMap, setStreamMap] = useState<Record<number, MatchedStream>>({})
  const [zliveMap, setZliveMap] = useState<Record<number, MatchedZLive>>({})
  const [daddyliveMap, setDaddyliveMap] = useState<Record<number, MatchedDaddyLive>>({})
  const [damitvMap, setDamitvMap] = useState<Record<number, MatchedDamiTv>>({})
  const [cinevidMap, setCinevidMap] = useState<Record<number, MatchedCinevid>>({})
  const [live24Map, setLive24Map] = useState<Record<number, MatchedLive24>>({})
  const [genericChannels, setGenericChannels] = useState<ZLiveChannel[]>([])
  const [activePlayer, setActivePlayer] = useState<ActivePlayerState | null>(null)

  useEffect(() => {
    const tick = () => setNow(Date.now())
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [])

  // Fetch Matchora stream matches on mount
  useEffect(() => {
    if (!isProviderEnabled("matchora")) {
      setMatchoraMap({})
      return
    }
    let unmounted = false
    async function loadMatchora() {
      try {
        const res = await fetch("/api/streams/matchora")
        if (!res.ok) return
        const data = await res.json()
        if (data?.streams && Array.isArray(data.streams) && !unmounted) {
          const map: Record<number, MatchedMatchora> = {}
          for (const s of data.streams) {
            if (s.event_id) map[s.event_id] = s
          }
          setMatchoraMap(map)
        }
      } catch (err) {
        console.warn("[live] Could not load Matchora streams:", err)
      }
    }
    loadMatchora()
    return () => {
      unmounted = true
    }
  }, [])

  // Fetch StreamFree stream matches on mount
  useEffect(() => {
    if (!isProviderEnabled("streamfree")) {
      setStreamMap({})
      return
    }
    let unmounted = false
    async function loadStreamFree() {
      try {
        const res = await fetch("/api/streamfree")
        if (!res.ok) return
        const data = await res.json()
        if (data?.streams && Array.isArray(data.streams) && !unmounted) {
          const map: Record<number, MatchedStream> = {}
          for (const s of data.streams) {
            if (s.event_id) map[s.event_id] = s
          }
          setStreamMap(map)
        }
      } catch (err) {
        console.warn("[live] Could not load StreamFree streams:", err)
      }
    }
    loadStreamFree()
    return () => {
      unmounted = true
    }
  }, [])

  // Fetch DAMITV stream matches on mount
  useEffect(() => {
    if (!isProviderEnabled("damitv")) {
      setDamitvMap({})
      return
    }
    let unmounted = false
    async function loadDamiTv() {
      try {
        const res = await fetch("/api/streams/damitv")
        if (!res.ok) return
        const data = await res.json()
        if (data?.streams && Array.isArray(data.streams) && !unmounted) {
          const map: Record<number, MatchedDamiTv> = {}
          for (const s of data.streams) {
            if (s.event_id) map[s.event_id] = s
          }
          setDamitvMap(map)
        }
      } catch (err) {
        console.warn("[live] Could not load DAMITV streams:", err)
      }
    }
    loadDamiTv()
    return () => {
      unmounted = true
    }
  }, [])

  // Fetch Cinevid stream matches on mount
  useEffect(() => {
    if (!isProviderEnabled("cinevid")) {
      setCinevidMap({})
      return
    }
    let unmounted = false
    async function loadCinevid() {
      try {
        const res = await fetch("/api/streams/cinevid")
        if (!res.ok) return
        const data = await res.json()
        if (data?.streams && Array.isArray(data.streams) && !unmounted) {
          const map: Record<number, MatchedCinevid> = {}
          for (const s of data.streams) {
            if (s.event_id) map[s.event_id] = s
          }
          setCinevidMap(map)
        }
      } catch (err) {
        console.warn("[live] Could not load Cinevid streams:", err)
      }
    }
    loadCinevid()
    return () => {
      unmounted = true
    }
  }, [])

  // Fetch Live24 stream matches on mount
  useEffect(() => {
    if (!isProviderEnabled("live24")) {
      setLive24Map({})
      return
    }
    let unmounted = false
    async function loadLive24() {
      try {
        const res = await fetch("/api/streams/live24")
        if (!res.ok) return
        const data = await res.json()
        if (data?.streams && Array.isArray(data.streams) && !unmounted) {
          const map: Record<number, MatchedLive24> = {}
          for (const s of data.streams) {
            if (s.event_id) map[s.event_id] = s
          }
          setLive24Map(map)
        }
      } catch (err) {
        console.warn("[live] Could not load Live24 streams:", err)
      }
    }
    loadLive24()
    return () => {
      unmounted = true
    }
  }, [])

  // Fetch DaddyLive stream matches on mount
  useEffect(() => {
    if (!isProviderEnabled("daddylive")) {
      setDaddyliveMap({})
      return
    }
    let unmounted = false
    async function loadDaddyLive() {
      try {
        const res = await fetch("/api/streams/daddylive")
        if (!res.ok) return
        const data = await res.json()
        if (data?.streams && Array.isArray(data.streams) && !unmounted) {
          const map: Record<number, MatchedDaddyLive> = {}
          for (const s of data.streams) {
            if (s.event_id) map[s.event_id] = s
          }
          setDaddyliveMap(map)
        }
      } catch (err) {
        console.warn("[live] Could not load DaddyLive streams:", err)
      }
    }
    loadDaddyLive()
    return () => {
      unmounted = true
    }
  }, [])

  // Fetch ZLive stream matches and generic channels on mount
  useEffect(() => {
    if (!isProviderEnabled("zlive")) {
      setZliveMap({})
      setGenericChannels([])
      return
    }
    let unmounted = false
    async function loadZLive() {
      try {
        const [matchesRes, genericRes] = await Promise.allSettled([
          fetch("/api/zlive"),
          fetch("/api/zlive?generic=1"),
        ])

        if (matchesRes.status === "fulfilled" && matchesRes.value.ok) {
          const data = await matchesRes.value.json()
          if (data?.channels && Array.isArray(data.channels) && !unmounted) {
            const map: Record<number, MatchedZLive> = {}
            for (const item of data.channels) {
              if (item.event_id) map[item.event_id] = item
            }
            setZliveMap(map)
          }
        }

        if (genericRes.status === "fulfilled" && genericRes.value.ok) {
          const data = await genericRes.value.json()
          if (data?.channels && Array.isArray(data.channels) && !unmounted) {
            setGenericChannels(data.channels)
          }
        }
      } catch (err) {
        console.warn("[live] Could not load ZLive data:", err)
      }
    }
    loadZLive()
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

  // Before mount there is no clock, so nothing can be bucketed yet.
  const { live, soon, upcoming } = splitFixtures(matches, now ?? 0)

  return (
    <div className="flex flex-col gap-8 relative">
      {/* 1. Matches: Live Now */}
      <Section
        title="Live Now"
        rows={now == null ? [] : live}
        now={now ?? 0}
        live
        empty="No matches in play."
        matchoraMap={matchoraMap}
        streamMap={streamMap}
        zliveMap={zliveMap}
        daddyliveMap={daddyliveMap}
        damitvMap={damitvMap}
        cinevidMap={cinevidMap}
        live24Map={live24Map}
      />

      {/* 2. Matches: Starting Soon */}
      <Section
        title="Starting Soon"
        rows={now == null ? [] : soon}
        now={now ?? 0}
        empty="Nothing kicking off in the next three hours."
        matchoraMap={matchoraMap}
        streamMap={streamMap}
        zliveMap={zliveMap}
        daddyliveMap={daddyliveMap}
        damitvMap={damitvMap}
        cinevidMap={cinevidMap}
        live24Map={live24Map}
      />

      {/* 3. Matches: Upcoming Fixtures */}
      <Section
        title="Upcoming Matches"
        rows={now == null ? [] : upcoming}
        now={now ?? 0}
        empty="No upcoming fixtures."
        matchoraMap={matchoraMap}
        streamMap={streamMap}
        zliveMap={zliveMap}
        daddyliveMap={daddyliveMap}
        damitvMap={damitvMap}
        cinevidMap={cinevidMap}
        live24Map={live24Map}
      />

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
