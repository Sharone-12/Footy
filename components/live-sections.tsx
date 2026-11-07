"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ExternalLinkIcon, GlobeIcon, MonitorPlayIcon, PlayIcon, RadioIcon, SparklesIcon, TvIcon } from "lucide-react"
import { TeamCrest, LeagueCrest } from "@/components/player-avatar"
import { LEAGUE_TOURNAMENT_ID } from "@/lib/teams"
import { splitFixtures, startOf, PLAYING_MS, type Timed } from "@/lib/live"
import { StreamingNetworkHealth } from "@/components/streaming-network-health"
import type { MatchedStream } from "@/lib/streamfree/types"
import type { MatchedZLive, ZLiveChannel } from "@/lib/zlive/types"
import type { MatchedDaddyLive } from "@/lib/daddylive/types"
import type { MatchedDamiTv } from "@/lib/damitv/types"
import type { MatchedCinevid } from "@/lib/cinevid/types"
import type { MatchedMatchora } from "@/lib/matchora/types"
import { UnifiedPlayer } from "@/components/unified-player"
import { formatKickoffIST } from "@/lib/time"

const pad = (n: number) => String(n).padStart(2, "0")

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
  genericChannel?: ZLiveChannel | null
  initialProvider?: "matchora" | "streamfree" | "zlive" | "daddylive" | "damitv" | "cinevid"
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
  onWatch?: (state: ActivePlayerState) => void
}) {
  const tid = LEAGUE_TOURNAMENT_ID[m.league]
  const hasStream = Boolean(matchedMatchora || matchedStream || matchedZLive || matchedDaddyLive || matchedDamiTv || matchedCinevid)
  const start = startOf(m)
  const left = start - now
  const isUnderAnHour = left > 0 && left <= 3600_000

  // Watch CTA & stream badges are only available when the match is LIVE or within 15 minutes of kickoff
  const isWatchable =
    hasStream &&
    (live || (left <= 15 * 60_000 && now - start < PLAYING_MS))

  return (
    <div className="card-lift fixture-row surface bg-card rounded-2xl px-4 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 transition-all">
      <Link
        href={`/predictions/match?id=${m.event_id}`}
        className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1 group"
      >
        <span className="flex flex-col leading-none w-20 sm:w-24 shrink-0">
          {live ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="relative flex size-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--pitch)] opacity-75 motion-reduce:hidden" />
                <span className="relative inline-flex rounded-full size-2 bg-[var(--pitch)]" />
              </span>
              <span className="stat-label text-[0.65rem] font-bold" style={{ color: "var(--pitch)" }}>
                LIVE
              </span>
            </span>
          ) : isUnderAnHour ? (
            <span className="inline-flex items-center gap-1 font-mono font-bold text-xs sm:text-sm text-amber-400">
              <span className="size-1.5 rounded-full bg-amber-400 animate-pulse" />
              <span>
                {pad(Math.floor(left / 60_000))}:{pad(Math.floor((left % 60_000) / 1000))}
              </span>
            </span>
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

      <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/50">
        {/* Available Streaming Providers & Watch CTA (only when live or within 15m of kickoff) */}
        {isWatchable && (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              {matchedMatchora && (
                <span
                  title={`Matchora (${matchedMatchora.event.channelCount} channel${matchedMatchora.event.channelCount === 1 ? "" : "s"})`}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.65rem] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/25"
                >
                  <GlobeIcon className="size-2.5" />
                  Matchora
                </span>
              )}

              {matchedDamiTv && (
                <span
                  title={`DAMITV (${matchedDamiTv.stream.sources.length} source${matchedDamiTv.stream.sources.length === 1 ? "" : "s"})`}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.65rem] font-semibold bg-violet-500/10 text-violet-400 border border-violet-500/25"
                >
                  <MonitorPlayIcon className="size-2.5" />
                  DAMITV
                </span>
              )}

              {matchedCinevid && (
                <span
                  title={`Cinevid (${matchedCinevid.isConfirmedMatch ? "Confirmed" : "Candidate"})`}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.65rem] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/25"
                >
                  <TvIcon className="size-2.5" />
                  Cinevid
                </span>
              )}

              {matchedStream && (
                <span
                  title="StreamFree source available"
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.65rem] font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/25"
                >
                  <SparklesIcon className="size-2.5" />
                  StreamFree
                </span>
              )}

              {matchedZLive && (
                <span
                  title={matchedZLive.isConfirmedMatch ? "ZLive match confirmed" : "ZLive broadcast channel"}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.65rem] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/25"
                >
                  <RadioIcon className="size-2.5" />
                  ZLive
                </span>
              )}

              {matchedDaddyLive && (
                <span
                  title={`DaddyLiveHD (${matchedDaddyLive.channels.length} channel${matchedDaddyLive.channels.length === 1 ? "" : "s"})`}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.65rem] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/25"
                >
                  <TvIcon className="size-2.5" />
                  DaddyLive
                  {matchedDaddyLive.channels.length > 1 && (
                    <span className="text-[10px] opacity-75">({matchedDaddyLive.channels.length})</span>
                  )}
                </span>
              )}
            </div>

            <Link
              href={`/live/watch?id=${m.event_id}`}
              aria-label={`Watch stream for ${m.home} vs ${m.away}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--pitch)] text-black hover:brightness-110 font-bold text-xs shadow-md transition-all hover:scale-[1.03]"
            >
              <PlayIcon className="size-3 fill-current" />
              Watch
            </Link>
          </div>
        )}

        <div className="flex items-center gap-2 shrink-0">
          <span className="hidden sm:inline text-xs text-muted-foreground truncate max-w-[130px]">
            {m.league}
          </span>
          {tid && <LeagueCrest tournamentId={tid} name={m.league} size={20} />}
        </div>
      </div>
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

  // Fetch StreamFree stream matches on mount (unwired for testing)
  useEffect(() => {
    // Unwired for testing
    setStreamMap({})
  }, [])

  // Fetch DAMITV stream matches on mount
  useEffect(() => {
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

  // Fetch DaddyLive stream matches on mount
  useEffect(() => {
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
