"use client"

import { useState, useRef, useEffect, useMemo, useCallback } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import {
  Maximize2Icon,
  Minimize2Icon,
  RefreshCwIcon,
  AlertCircleIcon,
  PlayIcon,
  SparklesIcon,
  RadioIcon,
  TvIcon,
  MonitorPlayIcon,
  ChevronLeftIcon,
  ShieldCheckIcon,
  InfoIcon,
  LayersIcon,
  CalendarIcon,
  ExternalLinkIcon,
  GlobeIcon,
  TvMinimalPlayIcon,
  ClockIcon,
  CheckCircle2Icon,
  BarChart3Icon,
  ArrowRightIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from "lucide-react"
import { TeamCrest, LeagueCrest } from "@/components/player-avatar"
import { LEAGUE_TOURNAMENT_ID, BARCA_ID } from "@/lib/teams"
import type { LiveFixture } from "@/components/live-sections"
import type { MatchedStream } from "@/lib/streamfree/types"
import type { MatchedZLive, ZLiveChannel } from "@/lib/zlive/types"
import type { MatchedDaddyLive } from "@/lib/daddylive/types"
import type { MatchedDamiTv } from "@/lib/damitv/types"
import type { MatchedCinevid } from "@/lib/cinevid/types"
import type { MatchedLive24 } from "@/lib/live24/types"
import type { MatchedMatchora } from "@/lib/matchora/types"
import type { StreamingProviderId } from "@/lib/streaming/types"
import { isProviderEnabled } from "@/lib/streaming/config"
import {
  buildProviders,
  resolveSource,
  allSources,
  PROVIDER_NAME,
  type WatchProvider,
  type WatchSource,
  type StreamBundle,
} from "@/lib/streaming/resolve"
import { formatKickoffIST, formatTimeIST, formatDateIST } from "@/lib/time"
import { LiveFixtureMark } from "@/components/live-score"

export type WatchStudioProps = {
  fixture: LiveFixture | null
  similarMatches: LiveFixture[]
  initialProvider?: StreamingProviderId
  initialSource?: string
  initialChannelId?: string
}

function formatKickoffDate(kickoff: string | null, date: string) {
  return formatKickoffIST(kickoff, date)
}

function formatCountdown(targetMs: number, nowMs: number) {
  const diffSec = Math.max(0, Math.floor((targetMs - nowMs) / 1000))
  const d = Math.floor(diffSec / 86400)
  const h = Math.floor((diffSec % 86400) / 3600)
  const m = Math.floor((diffSec % 3600) / 60)
  const s = diffSec % 60
  if (d > 0) return `${d}d ${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

export function WatchStudio({
  fixture,
  similarMatches,
  initialProvider,
  initialSource,
  initialChannelId,
}: WatchStudioProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const playerContainerRef = useRef<HTMLDivElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isCinemaMode, setIsCinemaMode] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [activeTab, setActiveTab] = useState<"about" | "streams" | "similar">("about")

  // Stream state bundle
  const [bundle, setBundle] = useState<StreamBundle>({})
  const [isBundleLoading, setIsBundleLoading] = useState(true)
  const [bundleError, setBundleError] = useState<string | null>(null)
  const [genericChannels, setGenericChannels] = useState<ZLiveChannel[]>([])

  // Selected stream coordinates
  const [selectedProviderId, setSelectedProviderId] = useState<StreamingProviderId | null>(
    initialProvider ?? (searchParams.get("provider") as StreamingProviderId) ?? null,
  )
  const [selectedSourceKey, setSelectedSourceKey] = useState<string | null>(
    initialSource ?? searchParams.get("source") ?? null,
  )

  const [isFrameLoading, setIsFrameLoading] = useState(true)
  const [hasFrameError, setHasFrameError] = useState(false)
  const [expandedProviders, setExpandedProviders] = useState<Record<string, boolean>>({})
  const [expandedDirectory, setExpandedDirectory] = useState(false)

  // Current wall clock for live match minutes and countdowns
  const [now, setNow] = useState<number>(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  // Kickoff timing
  const kickoffMs = useMemo(() => {
    if (!fixture?.kickoff) return null
    return new Date(fixture.kickoff).getTime()
  }, [fixture?.kickoff])

  const isLiveNow = useMemo(() => {
    if (!kickoffMs) return false
    // Match is within 115 minutes from kickoff
    return now >= kickoffMs && now <= kickoffMs + 115 * 60_000
  }, [kickoffMs, now])

  const isUpcoming = useMemo(() => {
    if (!kickoffMs) return false
    return now < kickoffMs
  }, [kickoffMs, now])

  // Fetch streams for fixture
  useEffect(() => {
    let unmounted = false
    setIsBundleLoading(true)
    setBundleError(null)

    async function loadStreams() {
      try {
        const fixtureId = fixture?.event_id
        if (!fixtureId && !initialChannelId) {
          setIsBundleLoading(false)
          return
        }

        const promises: Promise<Response>[] = []

        if (fixtureId) {
          promises.push(
            fetch(`/api/streams/matchora?fixture_id=${fixtureId}`).catch((e) => new Response(JSON.stringify({ error: String(e) }), { status: 500 })),
            fetch(`/api/streamfree?fixture_id=${fixtureId}`).catch((e) => new Response(JSON.stringify({ error: String(e) }), { status: 500 })),
            fetch(`/api/zlive?fixture_id=${fixtureId}`).catch((e) => new Response(JSON.stringify({ error: String(e) }), { status: 500 })),
            fetch(`/api/streams/daddylive?fixture_id=${fixtureId}`).catch((e) => new Response(JSON.stringify({ error: String(e) }), { status: 500 })),
            fetch(`/api/streams/damitv?fixture_id=${fixtureId}`).catch((e) => new Response(JSON.stringify({ error: String(e) }), { status: 500 })),
            fetch(`/api/streams/cinevid?fixture_id=${fixtureId}`).catch((e) => new Response(JSON.stringify({ error: String(e) }), { status: 500 })),
            fetch(`/api/streams/live24?fixture_id=${fixtureId}`).catch((e) => new Response(JSON.stringify({ error: String(e) }), { status: 500 })),
          )
        } else {
          // If no fixtureId, fill with dummy resolved promises
          for (let i = 0; i < 7; i++) {
            promises.push(Promise.resolve(new Response(JSON.stringify({}), { status: 200 })))
          }
        }

        // Also fetch generic 24/7 channels for directory & fallback
        promises.push(
          fetch(`/api/zlive?generic=1`).catch((e) => new Response(JSON.stringify({ channels: [] }), { status: 500 })),
        )

        const [moRes, sfRes, zlRes, dlRes, dtRes, cvRes, l24Res, genRes] = await Promise.all(promises)

        if (unmounted) return

        let moData: { event?: any; matched?: boolean; confidence?: number; channel?: any } = {}
        let sfData: { stream?: MatchedStream } = {}
        let zlData: { channel?: ZLiveChannel; match?: MatchedZLive; matched?: boolean } = {}
        let dlData: { match?: MatchedDaddyLive; channels?: any[]; matched?: boolean } = {}
        let dtData: { stream?: any; match?: MatchedDamiTv; matched?: boolean } = {}
        let cvData: { event?: any; matched?: boolean; confidence?: number; isConfirmedMatch?: boolean } = {}
        let l24Data: { event?: any; matched?: boolean; matchConfidence?: number; isConfirmedMatch?: boolean } = {}
        let genData: { channels?: ZLiveChannel[] } = {}

        if (moRes.ok) try { moData = await moRes.json() } catch { }
        if (sfRes.ok) try { sfData = await sfRes.json() } catch { }
        if (zlRes.ok) try { zlData = await zlRes.json() } catch { }
        if (dlRes.ok) try { dlData = await dlRes.json() } catch { }
        if (dtRes.ok) try { dtData = await dtRes.json() } catch { }
        if (cvRes.ok) try { cvData = await cvRes.json() } catch { }
        if (l24Res.ok) try { l24Data = await l24Res.json() } catch { }
        if (genRes.ok) try { genData = await genRes.json() } catch { }

        const generics = genData.channels ?? []
        setGenericChannels(generics)

        // Find generic channel if specified by channel ID
        let matchingGeneric: ZLiveChannel | null = null
        if (initialChannelId && generics.length > 0) {
          matchingGeneric = generics.find((c) => c.id === initialChannelId) ?? null
        }

        // Properly normalize matches for all 6 providers:
        const moMatch: MatchedMatchora | null =
          moData.matched && moData.event
            ? {
                event: moData.event,
                confidence: moData.confidence ?? 95,
                channel: moData.channel,
              }
            : null

        const sfMatch: MatchedStream | null = sfData.stream ?? null

        let zlMatch: MatchedZLive | null = null
        if (zlData.match) {
          zlMatch = zlData.match
        } else if (zlData.channel && (zlData as any).confidence !== undefined) {
          zlMatch = zlData as unknown as MatchedZLive
        } else if (zlData.channel) {
          zlMatch = {
            channel: zlData.channel,
            confidence: (zlData as any).confidence ?? 1,
            isConfirmedMatch: Boolean((zlData as any).isConfirmedMatch),
            isGenericBroadcaster: Boolean((zlData as any).isGenericBroadcaster),
          }
        }

        let dlMatch: MatchedDaddyLive | null = null
        if (dlData.match) {
          dlMatch = dlData.match
        } else if (Array.isArray(dlData.channels) && dlData.channels.length > 0) {
          dlMatch = dlData as unknown as MatchedDaddyLive
        }

        let dtMatch: MatchedDamiTv | null = null
        if (dtData.match) {
          dtMatch = dtData.match
        } else if (dtData.stream && (dtData as any).confidence !== undefined) {
          dtMatch = dtData as unknown as MatchedDamiTv
        } else if (dtData.stream) {
          dtMatch = {
            stream: dtData.stream,
            confidence: (dtData as any).confidence ?? 1,
            isConfirmedMatch: Boolean((dtData as any).isConfirmedMatch ?? true),
          }
        }

        const cvMatch: MatchedCinevid | null =
          cvData.matched && cvData.event
            ? {
                event: cvData.event,
                confidence: cvData.confidence ?? 85,
                isConfirmedMatch: Boolean(cvData.isConfirmedMatch ?? true),
                event_id: fixtureId ? Number(fixtureId) : undefined,
              }
            : null

        const l24Match: MatchedLive24 | null =
          l24Data.matched && l24Data.event
            ? {
                event: l24Data.event,
                matchConfidence: l24Data.matchConfidence ?? 85,
                isConfirmedMatch: Boolean(l24Data.isConfirmedMatch ?? true),
                event_id: Number(fixtureId || 0),
                fixture: {
                  home: fixture?.home || "",
                  away: fixture?.away || "",
                  league: fixture?.league || "",
                },
              }
            : null

        const newBundle: StreamBundle = {
          matchora: isProviderEnabled("matchora") ? moMatch : null,
          streamFree: isProviderEnabled("streamfree") ? sfMatch : null,
          zLive: isProviderEnabled("zlive") ? zlMatch : null,
          daddyLive: isProviderEnabled("daddylive") ? dlMatch : null,
          damiTv: isProviderEnabled("damitv") ? dtMatch : null,
          cinevid: isProviderEnabled("cinevid") ? cvMatch : null,
          live24: isProviderEnabled("live24") ? l24Match : null,
          genericChannel: matchingGeneric,
          genericChannels: generics,
        }

        setBundle(newBundle)
      } catch (err) {
        if (!unmounted) {
          console.error("[watch-studio] failed to load stream bundle:", err)
          setBundleError("Failed to load stream feeds.")
        }
      } finally {
        if (!unmounted) {
          setIsBundleLoading(false)
        }
      }
    }

    loadStreams()

    return () => {
      unmounted = true
    }
  }, [fixture?.event_id, initialChannelId])

  // Build normalized providers
  const providers: WatchProvider[] = useMemo(() => {
    return buildProviders(bundle)
  }, [bundle])

  // Resolve current active stream
  const activeResolution = useMemo(() => {
    return resolveSource(providers, selectedProviderId, selectedSourceKey)
  }, [providers, selectedProviderId, selectedSourceKey])

  const currentProvider = activeResolution?.provider ?? null
  const currentSource = activeResolution?.source ?? null

  // Auto-dismiss iframe loading overlay after max 1.6s so cross-origin feeds are never blocked
  useEffect(() => {
    if (isFrameLoading) {
      const timer = setTimeout(() => setIsFrameLoading(false), 1600)
      return () => clearTimeout(timer)
    }
  }, [isFrameLoading, reloadKey, currentSource?.key])

  // Keep state and URL query params synchronized
  const selectSource = useCallback(
    (providerId: StreamingProviderId, sourceKey: string) => {
      setSelectedProviderId(providerId)
      setSelectedSourceKey(sourceKey)
      setIsFrameLoading(true)
      setHasFrameError(false)

      // When picking a ZLive channel, ensure bundle's genericChannel is updated immediately
      if (providerId === "zlive") {
        const rawId = sourceKey.replace(/^zlive:/, "")
        const ch = genericChannels.find((c) => c.id === rawId)
        if (ch) {
          setBundle((prev) => ({
            ...prev,
            genericChannel: ch,
          }))
        }
      }

      // Update URL without a page reload so refresh preserves the stream
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href)
        url.searchParams.set("provider", providerId)
        url.searchParams.set("source", sourceKey)
        window.history.replaceState({}, "", url.toString())
      }
    },
    [genericChannels],
  )

  // Fullscreen container handler: attempts direct iframe fullscreen for 100% pure video with no UI
  const toggleFullscreen = useCallback(async () => {
    try {
      const fsEl = document.fullscreenElement || (document as any).webkitFullscreenElement
      if (!fsEl) {
        const iframe = playerContainerRef.current?.querySelector("iframe")
        if (iframe) {
          const reqFs = iframe.requestFullscreen || (iframe as any).webkitRequestFullscreen
          if (reqFs) {
            try {
              await reqFs.call(iframe)
              setIsFullscreen(true)
              return
            } catch {
              // If iframe direct fullscreen fails (e.g. cross-origin restrictions), fall through to container
            }
          }
        }
        if (playerContainerRef.current) {
          const reqFs = playerContainerRef.current.requestFullscreen || (playerContainerRef.current as any).webkitRequestFullscreen
          if (reqFs) {
            await reqFs.call(playerContainerRef.current)
            setIsFullscreen(true)
          }
        }
      } else {
        const exitFs = document.exitFullscreen || (document as any).webkitExitFullscreen
        if (exitFs) {
          await exitFs.call(document)
        }
        setIsFullscreen(false)
      }
    } catch (e) {
      console.warn("Fullscreen toggle failed:", e)
    }
  }, [])

  useEffect(() => {
    function handleFsChange() {
      const isFs = Boolean(document.fullscreenElement || (document as any).webkitFullscreenElement)
      setIsFullscreen(isFs)
    }
    document.addEventListener("fullscreenchange", handleFsChange)
    document.addEventListener("webkitfullscreenchange", handleFsChange)
    return () => {
      document.removeEventListener("fullscreenchange", handleFsChange)
      document.removeEventListener("webkitfullscreenchange", handleFsChange)
    }
  }, [])

  const reloadStream = useCallback(() => {
    setIsFrameLoading(true)
    setHasFrameError(false)
    setReloadKey((k) => k + 1)
  }, [])

  const tid = fixture?.league ? LEAGUE_TOURNAMENT_ID[fixture.league] : undefined
  const isBarcaMatch = fixture?.home_id === BARCA_ID || fixture?.away_id === BARCA_ID

  return (
    <div className="flex flex-col gap-6 animate-fade-in w-full pb-16">
      {/* 1. TOP BAR: Back Navigation, Breadcrumb, and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/40 pb-4">
        <div className="flex items-center gap-3">
          <Link
            href="/live"
            className="nav-pill inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-all hover:scale-[1.02]"
            title="Return to Live Fixtures"
          >
            <ChevronLeftIcon className="size-4" />
            <span>Back to Live</span>
          </Link>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>/</span>
            <span className="font-semibold text-foreground uppercase tracking-wider text-[11px]" style={{ fontFamily: "var(--font-condensed)" }}>
              FOOTYY LIVE
            </span>
            {fixture?.league && (
              <>
                <span>/</span>
                <span className="truncate max-w-[140px] sm:max-w-[200px] text-[11px] text-muted-foreground font-medium">
                  {fixture.league}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2.5 self-end sm:self-auto">
          {isLiveNow && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--pitch)]/10 text-[var(--pitch)] border border-[var(--pitch)]/30 text-xs font-bold tracking-wider">
              <span className="relative flex size-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--pitch)] opacity-75 motion-reduce:hidden" />
                <span className="relative inline-flex rounded-full size-2 bg-[var(--pitch)]" />
              </span>
              <span>LIVE</span>
            </span>
          )}

          <button
            type="button"
            onClick={() => setIsCinemaMode((prev) => !prev)}
            className={`hidden lg:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${isCinemaMode
                ? "bg-[var(--pitch)] text-black border-[var(--pitch)] font-bold shadow-md"
                : "nav-pill text-muted-foreground hover:text-foreground"
              }`}
            title={isCinemaMode ? "Exit Cinema Mode" : "Expand to Cinema Mode"}
          >
            {isCinemaMode ? <Minimize2Icon className="size-3.5" /> : <Maximize2Icon className="size-3.5" />}
            <span>{isCinemaMode ? "Exit Cinema" : "Cinema Mode"}</span>
          </button>
        </div>
      </div>

      {/* 2. MATCH INFORMATION HEADER CARD (Hero Banner with High-Density Telemetry) */}
      {fixture && (() => {
        const hasScore = fixture.home_goals != null && fixture.away_goals != null
        return (
          <section
            className={`surface bg-card rounded-3xl p-4 sm:p-5 transition-all relative overflow-hidden border border-border/70 shadow-lg ${
              isBarcaMatch ? "barca-stripes" : ""
            }`}
          >
            <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-4 lg:gap-8">
              {/* Teams & Score / VS Center */}
              <div className="flex items-center gap-3 sm:gap-6 min-w-0 flex-1">
                {/* Home Team */}
                <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0 flex-1 justify-end">
                  <span
                    className="font-bold text-base sm:text-xl md:text-2xl uppercase tracking-tight truncate text-right"
                    style={{ fontFamily: "var(--font-condensed)" }}
                  >
                    {fixture.home}
                  </span>
                  {fixture.home_id != null && (
                    <TeamCrest
                      teamId={fixture.home_id}
                      name={fixture.home}
                      size={40}
                      className="shrink-0 drop-shadow-md"
                    />
                  )}
                </div>

                {/* Score Hub or VS Badge */}
                <div className="flex flex-col items-center justify-center shrink-0 px-1 sm:px-3">
                  {hasScore ? (
                    <div className="flex items-center gap-2 px-3.5 py-1 rounded-2xl bg-black/60 border border-white/10 shadow-inner">
                      <span className="font-mono text-xl sm:text-2xl font-black text-white">
                        {fixture.home_goals}
                      </span>
                      <span className="text-white/40 font-mono text-sm font-bold">:</span>
                      <span className="font-mono text-xl sm:text-2xl font-black text-white">
                        {fixture.away_goals}
                      </span>
                    </div>
                  ) : (
                    <span
                      className="px-3 py-1 rounded-full text-[11px] sm:text-xs font-black tracking-widest bg-black/60 border border-white/10 text-muted-foreground"
                      style={{ fontFamily: "var(--font-condensed)" }}
                    >
                      VS
                    </span>
                  )}
                </div>

                {/* Away Team */}
                <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0 flex-1">
                  {fixture.away_id != null && (
                    <TeamCrest
                      teamId={fixture.away_id}
                      name={fixture.away}
                      size={40}
                      className="shrink-0 drop-shadow-md"
                    />
                  )}
                  <span
                    className="font-bold text-base sm:text-xl md:text-2xl uppercase tracking-tight truncate"
                    style={{ fontFamily: "var(--font-condensed)" }}
                  >
                    {fixture.away}
                  </span>
                </div>
              </div>

              {/* Right: Telemetry Strip (Fills previously empty space with competition, kickoff & status) */}
              <div className="flex items-center flex-wrap sm:flex-nowrap gap-2.5 sm:gap-3 lg:border-l lg:border-white/10 lg:pl-6 shrink-0 justify-between lg:justify-end">
                {/* 1. Competition & Round */}
                <div className="flex items-center gap-2.5 px-3 py-2 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
                  {tid && <LeagueCrest tournamentId={tid} name={fixture.league} size={22} variant="transparent" />}
                  <div className="flex flex-col leading-tight">
                    <span className="text-xs font-bold text-foreground truncate max-w-[120px] sm:max-w-[150px]">
                      {fixture.league}
                    </span>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {fixture.round ? `Round ${fixture.round}` : "League Match"}
                    </span>
                  </div>
                </div>

                {/* 2. Kickoff Time & Date */}
                <div className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
                  <ClockIcon className="size-3.5 text-muted-foreground shrink-0" />
                  <div className="flex flex-col leading-tight">
                    <span className="text-xs font-semibold text-foreground">
                      {fixture.kickoff ? formatTimeIST(fixture.kickoff) : formatKickoffDate(fixture.kickoff, fixture.date)}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {formatDateIST(fixture.kickoff || `${fixture.date}T12:00:00Z`)}
                    </span>
                  </div>
                </div>

                {/* 3. Match Status Badge & Live Score / Countdown */}
                <div className="shrink-0 flex items-center gap-2.5">
                  <LiveFixtureMark fixture={fixture} />
                  {isLiveNow ? (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-[var(--pitch)]/10 border border-[var(--pitch)]/30 text-[var(--pitch)] shadow-sm">
                      <span className="relative flex size-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--pitch)] opacity-75 motion-reduce:hidden" />
                        <span className="relative inline-flex rounded-full size-2 bg-[var(--pitch)]" />
                      </span>
                      <span className="text-[11px] font-black uppercase tracking-wider">LIVE MATCH</span>
                    </div>
                  ) : isUpcoming && kickoffMs ? (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-white/[0.04] border border-white/10">
                      <div className="flex flex-col items-end leading-tight">
                        <span className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider">
                          {kickoffMs - now <= 3600_000 ? "Kickoff In" : "Status"}
                        </span>
                        <span className="font-mono text-xs font-bold text-[var(--pitch)]">
                          {kickoffMs - now <= 3600_000
                            ? formatCountdown(kickoffMs, now)
                            : "UPCOMING"}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-3 py-2 rounded-2xl bg-card border border-border text-xs text-muted-foreground font-semibold">
                      SCHEDULED
                    </span>
                  )}
                </div>
              </div>
            </div>
          </section>
        )
      })()}

      {/* 3. MAIN BROADCAST SUITE: Two Column Layout */}
      <div className={`grid gap-6 transition-all ${isCinemaMode ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-12"}`}>
        {/* A. LEFT / MAIN VIDEO PLAYER COLUMN (approx 72% on desktop, 100% in cinema mode) */}
        <div className={`flex flex-col gap-6 ${isCinemaMode ? "w-full" : "lg:col-span-8 xl:col-span-9"}`}>
          {/* Video Container Card with Ambient Depth Glow */}
          <div
            ref={playerContainerRef}
            className={`group relative rounded-3xl overflow-hidden border border-white/10 bg-[#060606] flex flex-col transition-all ${
              isFullscreen
                ? "fixed inset-0 z-50 rounded-none w-screen h-screen border-none"
                : "shadow-[0_20px_60px_-15px_rgba(0,0,0,0.9),0_0_40px_-20px_rgba(0,255,135,0.06)] ring-1 ring-white/5"
            }`}
          >
            {/* Top Video Header Overlay with subtle gradient */}
            <div
              className={`flex items-center justify-between px-4 sm:px-5 py-2.5 bg-gradient-to-b from-black/95 via-black/80 to-transparent backdrop-blur-md border-b border-white/[0.08] z-20 shrink-0 transition-all ${
                isFullscreen ? "hidden" : ""
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/[0.06] border border-white/10">
                  <span className="size-2 rounded-full bg-[var(--pitch)] inline-block shadow-[0_0_8px_var(--pitch)] animate-pulse" />
                  <span
                    className="font-black text-xs uppercase tracking-wider text-foreground"
                    style={{ fontFamily: "var(--font-condensed)" }}
                  >
                    FOOTYY LIVE
                  </span>
                </div>
                <span className="text-white/20 text-xs">/</span>
                <span className="text-xs text-muted-foreground truncate max-w-[180px] sm:max-w-xs font-medium">
                  {fixture ? `${fixture.home} vs ${fixture.away}` : "Broadcast Feed"}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {currentProvider && currentSource && (
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-white/[0.06] text-white/90 border border-white/10 shadow-sm">
                    <span className="size-1.5 rounded-full bg-[var(--pitch)] animate-pulse" />
                    <span className="text-muted-foreground font-medium">{currentProvider.name}:</span>
                    <strong className="text-foreground">{currentSource.label}</strong>
                    {currentSource.quality && (
                      <span className="text-[10px] text-[var(--pitch)] font-mono ml-0.5 px-1 py-0.2 bg-[var(--pitch)]/10 rounded">
                        {currentSource.quality}
                      </span>
                    )}
                  </div>
                )}
                {isLiveNow && (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[var(--pitch)] text-black text-[10px] font-black uppercase tracking-wider shadow-sm">
                    <span className="size-1.5 rounded-full bg-black animate-ping motion-reduce:hidden" />
                    ON AIR
                  </span>
                )}
              </div>
            </div>

            {/* Cinematic Video Display Area (Pure Pitch Black, expands to 100% full screen in fullscreen mode) */}
            <div className={`relative w-full bg-black flex items-center justify-center overflow-hidden ${
              isFullscreen ? "w-full h-full flex-1" : "aspect-video"
            }`}>

              {/* 1. LOADING STATE */}
              {isBundleLoading && (
                <div className="absolute inset-0 z-30 flex flex-col items-center justify-center p-6 bg-black/90 backdrop-blur-sm animate-fade-in text-center">
                  <div className="relative flex items-center justify-center mb-4">
                    <div className="size-16 rounded-full border-2 border-white/10 border-t-[var(--pitch)] animate-spin" />
                    <span
                      className="absolute font-black text-sm tracking-tighter text-white uppercase"
                      style={{ fontFamily: "var(--font-condensed)" }}
                    >
                      FOOTYY
                    </span>
                  </div>
                  <h3
                    className="text-lg font-bold uppercase tracking-tight text-foreground"
                    style={{ fontFamily: "var(--font-condensed)" }}
                  >
                    CONNECTING TO BROADCAST
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                    Aggregating verified streaming feeds across StreamFree, DAMITV, DaddyLive, and ZLive...
                  </p>
                </div>
              )}

              {/* 2. NO STREAMS / OFFLINE STATE */}
              {!isBundleLoading && !currentSource && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6 bg-black/95 text-center">
                  <div className="size-14 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-4 text-muted-foreground">
                    <AlertCircleIcon className="size-7 text-amber-400" />
                  </div>
                  <h3
                    className="text-xl font-bold uppercase tracking-tight text-foreground"
                    style={{ fontFamily: "var(--font-condensed)" }}
                  >
                    {isUpcoming ? "STREAM STARTING SOON" : "STREAM CURRENTLY UNAVAILABLE"}
                  </h3>
                  <p className="text-xs sm:text-sm text-muted-foreground mt-1.5 max-w-md">
                    {isUpcoming
                      ? `Coverage for ${fixture?.home} vs ${fixture?.away} typically activates 15–30 minutes before kickoff.`
                      : "No verified broadcast feed has been opened yet by our streaming providers for this fixture."}
                  </p>

                  {isUpcoming && kickoffMs && (
                    <div className="mt-4 px-4 py-2 rounded-2xl bg-white/5 border border-white/10 flex items-center gap-2">
                      <ClockIcon className="size-4 text-[var(--pitch)]" />
                      <span className="text-xs text-muted-foreground">Scheduled Kickoff In:</span>
                      <span className="font-mono text-xs font-bold text-foreground">
                        {formatCountdown(kickoffMs, now)}
                      </span>
                    </div>
                  )}

                  {genericChannels.length > 0 && (
                    <div className="mt-6 flex flex-col items-center">
                      <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
                        Or Watch 24/7 Football Broadcasters:
                      </span>
                      <div className="flex flex-wrap items-center justify-center gap-2 max-w-lg">
                        {genericChannels.slice(0, 4).map((ch) => (
                          <button
                            key={ch.id}
                            type="button"
                            onClick={() => selectSource("zlive", `zlive:${ch.id}`)}
                            className="px-3 py-1 rounded-xl bg-card border border-border/80 hover:border-[var(--pitch)] hover:text-[var(--pitch)] text-xs font-semibold transition-all"
                          >
                            {ch.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 3. ACTIVE IFRAME STREAM PLAYER */}
              {!isBundleLoading && currentSource && (
                <>
                  {isFrameLoading && (
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/85 backdrop-blur-xs pointer-events-none transition-opacity duration-300">
                      <div className="size-10 rounded-full border-2 border-white/10 border-t-[var(--pitch)] animate-spin mb-3" />
                      <span className="text-xs text-muted-foreground font-mono">
                        INITIALIZING {currentSource.label.toUpperCase()} ({currentProvider?.name.toUpperCase()})...
                      </span>
                    </div>
                  )}

                  {hasFrameError && (
                    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6 bg-black/95 text-center">
                      <AlertCircleIcon className="size-8 text-rose-500 mb-2" />
                      <h4 className="font-bold text-sm text-foreground">STREAM FEED TIMED OUT</h4>
                      <p className="text-xs text-muted-foreground max-w-sm mt-1 mb-4">
                        The provider stream encountered a connection interruption. Try reconnecting or switch to another provider.
                      </p>
                      <button
                        type="button"
                        onClick={reloadStream}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--pitch)] text-black font-bold text-xs hover:brightness-110"
                      >
                        <RefreshCwIcon className="size-3.5" />
                        Reconnect Stream
                      </button>
                    </div>
                  )}

                  <iframe
                    key={`${currentSource.key}-${reloadKey}`}
                    src={currentSource.url}
                    title={`${fixture?.home ?? "Live"} vs ${fixture?.away ?? "Match"} — ${currentSource.label}`}
                    className={`w-full h-full border-0 bg-black block transition-transform ${
                      currentProvider?.id === "zlive" ? "scale-[1.035] origin-center" : ""
                    }`}
                    allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                    allowFullScreen
                    referrerPolicy="no-referrer"
                    onLoad={() => setIsFrameLoading(false)}
                    onError={() => {
                      setIsFrameLoading(false)
                      setHasFrameError(true)
                    }}
                  />
                </>
              )}
            </div>

            {/* Bottom Controls Bar (floats and auto-hides in fullscreen mode) */}
            <div className={
              isFullscreen
                ? "absolute bottom-0 inset-x-0 z-30 flex items-center justify-between px-4 py-3 bg-neutral-950/80 backdrop-blur-md border-t border-white/10 text-xs transition-opacity duration-300 opacity-0 group-hover:opacity-100"
                : "flex items-center justify-between px-4 py-3 bg-neutral-900/90 border-t border-border/50 text-xs shrink-0"
            }>
              <div className="flex items-center gap-2.5">
                {currentSource ? (
                  <>
                    <span className="size-2 rounded-full bg-[var(--pitch)] animate-pulse" />
                    <span className="font-bold text-foreground truncate max-w-[150px] sm:max-w-xs">
                      {currentSource.label}
                    </span>
                    <span className="text-muted-foreground text-[11px]">
                      via {currentProvider?.name}
                    </span>
                    {currentSource.quality && (
                      <span className="px-2 py-0.5 rounded-md bg-white/10 text-foreground font-mono text-[10px] font-bold">
                        {currentSource.quality}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-muted-foreground">Select a stream provider on the right</span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {currentSource?.url && (
                  <a
                    href={currentSource.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
                    title="Open Stream in New Tab (Direct Feed)"
                  >
                    <ExternalLinkIcon className="size-4" />
                  </a>
                )}

                <button
                  type="button"
                  onClick={reloadStream}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
                  title="Reload Stream Feed"
                >
                  <RefreshCwIcon className="size-4" />
                </button>

                <button
                  type="button"
                  onClick={toggleFullscreen}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
                  title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
                >
                  {isFullscreen ? <Minimize2Icon className="size-4" /> : <Maximize2Icon className="size-4" />}
                </button>
              </div>
            </div>
          </div>

          {/* Three Tabbed Sections Below Main Player */}
          <div className="flex flex-col gap-4">
            {/* Tab Navigation Pill Bar */}
            <div className="flex items-center gap-2 border-b border-border/50 pb-2">
              <button
                type="button"
                onClick={() => setActiveTab("about")}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${activeTab === "about"
                    ? "bg-card text-foreground border border-border/80 shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-card/50"
                  }`}
                style={{ fontFamily: "var(--font-condensed)" }}
              >
                <InfoIcon className="size-3.5 text-[var(--pitch)]" />
                <span>ABOUT</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("streams")}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${activeTab === "streams"
                    ? "bg-card text-foreground border border-border/80 shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-card/50"
                  }`}
                style={{ fontFamily: "var(--font-condensed)" }}
              >
                <LayersIcon className="size-3.5 text-[var(--pitch)]" />
                <span>STREAMS ({allSources(providers).length})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("similar")}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${activeTab === "similar"
                    ? "bg-card text-foreground border border-border/80 shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-card/50"
                  }`}
                style={{ fontFamily: "var(--font-condensed)" }}
              >
                <CalendarIcon className="size-3.5 text-[var(--pitch)]" />
                <span>SIMILAR MATCHES ({similarMatches.length})</span>
              </button>
            </div>

            {/* TAB CONTENT: 1. ABOUT */}
            {activeTab === "about" && (
              <div className="surface bg-card rounded-2xl p-5 border border-border/60 animate-fade-in flex flex-col gap-5">
                <div>
                  <h4
                    className="text-base font-bold uppercase tracking-tight text-foreground mb-1.5"
                    style={{ fontFamily: "var(--font-condensed)" }}
                  >
                    MATCH OVERVIEW
                  </h4>
                  <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                    {fixture ? (
                      <>
                        Live broadcast coverage for <span className="text-foreground font-semibold">{fixture.home}</span> vs{" "}
                        <span className="text-foreground font-semibold">{fixture.away}</span> in the{" "}
                        <span className="text-[var(--pitch)] font-semibold">{fixture.league}</span>. Streams are
                        synchronized with real-time match events and broadcast availability across our verified provider network.
                      </>
                    ) : (
                      "Dedicated live stream feed provided by FOOTYY."
                    )}
                  </p>
                </div>

                {fixture && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-border/40">
                    {/* Home Club Card */}
                    <div className="p-3.5 rounded-xl bg-background/50 border border-border/50 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {fixture.home_id && <TeamCrest teamId={fixture.home_id} name={fixture.home} size={30} />}
                        <div>
                          <span className="block font-bold text-sm text-foreground">{fixture.home}</span>
                          <span className="block text-[11px] text-muted-foreground">Home Club</span>
                        </div>
                      </div>
                      {fixture.home_id && (
                        <Link
                          href={`/teams/compare?home=${fixture.home_id}&away=${fixture.away_id ?? ""}`}
                          className="text-[11px] text-[var(--pitch)] hover:underline font-semibold flex items-center gap-1"
                        >
                          Compare <ArrowRightIcon className="size-3" />
                        </Link>
                      )}
                    </div>

                    {/* Away Club Card */}
                    <div className="p-3.5 rounded-xl bg-background/50 border border-border/50 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {fixture.away_id && <TeamCrest teamId={fixture.away_id} name={fixture.away} size={30} />}
                        <div>
                          <span className="block font-bold text-sm text-foreground">{fixture.away}</span>
                          <span className="block text-[11px] text-muted-foreground">Away Club</span>
                        </div>
                      </div>
                      {fixture.away_id && (
                        <Link
                          href={`/teams/compare?home=${fixture.home_id ?? ""}&away=${fixture.away_id}`}
                          className="text-[11px] text-[var(--pitch)] hover:underline font-semibold flex items-center gap-1"
                        >
                          Compare <ArrowRightIcon className="size-3" />
                        </Link>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB CONTENT: 2. STREAMS */}
            {activeTab === "streams" && (
              <div className="surface bg-card rounded-2xl p-5 border border-border/60 animate-fade-in flex flex-col gap-5">
                <div>
                  <h4
                    className="text-base font-bold uppercase tracking-tight text-foreground mb-1"
                    style={{ fontFamily: "var(--font-condensed)" }}
                  >
                    ACTIVE STREAMING PROVIDERS
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    All verified external streaming endpoints mapped to this match.
                  </p>
                </div>

                {/* CURRENTLY ACTIVE STREAM HIGHLIGHT BANNER */}
                {currentSource && (
                  <div className="p-3.5 rounded-2xl bg-[var(--pitch)]/10 border-2 border-[var(--pitch)]/40 flex items-center justify-between shadow-md">
                    <div className="flex items-center gap-3">
                      <span className="relative flex size-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--pitch)] opacity-75" />
                        <span className="relative inline-flex rounded-full size-3 bg-[var(--pitch)]" />
                      </span>
                      <div>
                        <span className="text-[10px] uppercase font-black tracking-widest text-muted-foreground block">
                          NOW PLAYING IN STUDIO
                        </span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-sm sm:text-base font-bold text-foreground">
                            {currentSource.label}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-[var(--pitch)] text-black text-[10px] font-black uppercase font-mono">
                            {currentProvider?.name}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {currentSource.quality && (
                        <span className="px-2.5 py-1 rounded-lg bg-black/70 text-[var(--pitch)] font-mono text-xs font-bold border border-[var(--pitch)]/30">
                          {currentSource.quality}
                        </span>
                      )}
                      <span className="hidden sm:inline-flex px-2 py-1 rounded-lg bg-[var(--pitch)]/20 text-[var(--pitch)] text-xs font-bold">
                        STREAMING
                      </span>
                    </div>
                  </div>
                )}

                {providers.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">
                    No active match streams available currently.
                  </p>
                ) : (
                  <div className="flex flex-col gap-3">
                    {providers.map((p) => (
                      <div
                        key={p.id}
                        className="p-3.5 rounded-xl bg-background/60 border border-border/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-foreground">{p.name}</span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--pitch)]/10 text-[var(--pitch)] border border-[var(--pitch)]/30">
                              {p.status}
                            </span>
                          </div>
                          {p.caveat && (
                            <p className="text-[11px] text-muted-foreground mt-0.5">{p.caveat}</p>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {p.sources.slice(0, 12).map((src) => {
                            const isCurrent = currentSource?.key === src.key
                            return (
                              <button
                                key={src.key}
                                type="button"
                                onClick={() => selectSource(p.id, src.key)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${isCurrent
                                    ? "bg-[var(--pitch)] text-black font-bold shadow-md scale-[1.03]"
                                    : "bg-card hover:bg-accent border border-border/80 text-foreground"
                                  }`}
                              >
                                {isCurrent ? (
                                  <span className="size-2 rounded-full bg-black animate-pulse" />
                                ) : (
                                  <PlayIcon className="size-2.5 fill-current" />
                                )}
                                <span>{src.label}</span>
                                {src.quality && (
                                  <span className="text-[10px] opacity-75 font-mono">({src.quality})</span>
                                )}
                                {isCurrent && (
                                  <span className="text-[9px] px-1 rounded bg-black text-[var(--pitch)] font-mono font-black ml-1">
                                    ON AIR
                                  </span>
                                )}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* 24/7 Football Broadcasters */}
                {genericChannels.length > 0 && (
                  <div className="pt-4 border-t border-border/40">
                    <div className="flex items-center justify-between mb-2.5">
                      <div>
                        <h5 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                          24/7 Football Broadcasters Directory (Backup Channels)
                        </h5>
                        <p className="text-[11px] text-muted-foreground">
                          Click any channel to switch the live player instantly.
                        </p>
                      </div>
                      <span className="text-[11px] font-mono text-muted-foreground">
                        {genericChannels.length} channels
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                      {(expandedDirectory ? genericChannels : genericChannels.slice(0, 12)).map((ch) => {
                        const isCurrent = currentSource?.key === `zlive:${ch.id}`
                        return (
                          <button
                            key={ch.id}
                            type="button"
                            onClick={() => selectSource("zlive", `zlive:${ch.id}`)}
                            className={`p-2.5 rounded-xl border flex items-center justify-between text-left text-xs transition-all ${isCurrent
                                ? "bg-[var(--pitch)] text-black border-2 border-[var(--pitch)] font-bold shadow-[0_0_15px_-2px_var(--pitch)] scale-[1.02]"
                                : "bg-background/40 hover:bg-accent/40 border-border/40 hover:border-emerald-500/50 text-foreground"
                              }`}
                          >
                            <div className="flex items-center gap-1.5 truncate mr-1">
                              {isCurrent && (
                                <span className="size-2 rounded-full bg-black animate-pulse shrink-0" />
                              )}
                              <span className="truncate font-semibold">{ch.name}</span>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {isCurrent ? (
                                <span className="px-1.5 py-0.5 rounded bg-black text-[var(--pitch)] text-[9px] font-mono font-black uppercase tracking-wider">
                                  ACTIVE
                                </span>
                              ) : ch.quality ? (
                                <span className="text-[9px] px-1 rounded bg-black/40 text-muted-foreground font-mono">
                                  {ch.quality}
                                </span>
                              ) : null}
                            </div>
                          </button>
                        )
                      })}
                    </div>

                    {genericChannels.length > 12 && (
                      <div className="mt-3 flex justify-center">
                        <button
                          type="button"
                          onClick={() => setExpandedDirectory((prev) => !prev)}
                          className="px-4 py-2 rounded-xl bg-card hover:bg-accent border border-border text-xs font-bold text-[var(--pitch)] inline-flex items-center gap-1.5 transition-all hover:scale-[1.02]"
                        >
                          {expandedDirectory ? (
                            <>
                              <span>Show Less</span>
                              <ChevronUpIcon className="size-3.5" />
                            </>
                          ) : (
                            <>
                              <span>View All {genericChannels.length} Channels</span>
                              <ChevronDownIcon className="size-3.5" />
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* TAB CONTENT: 3. SIMILAR MATCHES */}
            {activeTab === "similar" && (
              <div className="surface bg-card rounded-2xl p-5 border border-border/60 animate-fade-in flex flex-col gap-4">
                <div>
                  <h4
                    className="text-base font-bold uppercase tracking-tight text-foreground mb-1"
                    style={{ fontFamily: "var(--font-condensed)" }}
                  >
                    RELATED FIXTURES
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Other upcoming and live matches from our database.
                  </p>
                </div>

                {similarMatches.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">No other matches this week.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {similarMatches.slice(0, 6).map((m) => {
                      const matchTid = LEAGUE_TOURNAMENT_ID[m.league]
                      const start = m.kickoff ? new Date(m.kickoff).getTime() : new Date(`${m.date}T23:59:59Z`).getTime()
                      const isSimilarWatchable =
                        (now >= start && now <= start + 115 * 60_000) ||
                        (start - now <= 15 * 60_000 && now < start + 115 * 60_000)

                      return (
                        <div
                          key={m.event_id}
                          className="p-3 rounded-xl bg-background/50 border border-border/60 flex items-center justify-between gap-3 hover:border-border transition-all"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            {matchTid && <LeagueCrest tournamentId={matchTid} name={m.league} size={18} variant="transparent" />}
                            <div className="truncate">
                              <span className="block font-semibold text-xs text-foreground truncate">
                                {m.home} vs {m.away}
                              </span>
                              <span className="block text-[10px] text-muted-foreground">
                                {formatKickoffDate(m.kickoff, m.date)}
                              </span>
                            </div>
                          </div>

                          <Link
                            href={isSimilarWatchable ? `/live/watch?id=${m.event_id}` : `/predictions/match?id=${m.event_id}`}
                            className={`px-3 py-1.5 rounded-lg font-bold text-xs shrink-0 transition-all ${
                              isSimilarWatchable
                                ? "bg-[var(--pitch)] text-black hover:brightness-110 shadow-sm"
                                : "bg-card hover:bg-accent text-muted-foreground hover:text-foreground border border-border"
                            }`}
                          >
                            {isSimilarWatchable ? "Watch" : "Preview"}
                          </Link>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* B. RIGHT SIDEBAR: Available Streams & Match Centre (approx 28% width, hidden in cinema mode) */}
        {/* B. RIGHT SIDEBAR: Available Streams & Match Centre (Compacted for reduced vertical scroll) */}
        {!isCinemaMode && (
          <aside className="lg:col-span-4 xl:col-span-3 flex flex-col gap-4">
            {/* 1. AVAILABLE STREAMS PANEL */}
            <div className="surface bg-card rounded-3xl p-4 sm:p-4.5 border border-border/70 flex flex-col gap-3">
              <div className="flex items-center justify-between border-b border-border/50 pb-2.5">
                <div className="flex items-center gap-2">
                  <TvMinimalPlayIcon className="size-4 text-[var(--pitch)]" />
                  <h3
                    className="font-bold text-xs sm:text-sm uppercase tracking-wider text-foreground"
                    style={{ fontFamily: "var(--font-condensed)" }}
                  >
                    AVAILABLE BROADCASTS
                  </h3>
                </div>
                <span className="text-[11px] font-mono font-bold text-muted-foreground">
                  {providers.length} {providers.length === 1 ? "source" : "sources"}
                </span>
              </div>

              {providers.length === 0 ? (
                <div className="py-6 text-center text-xs text-muted-foreground">
                  <p>Searching for live feeds...</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {providers.map((p) => {
                    const isProviderSelected = currentProvider?.id === p.id
                    return (
                      <div
                        key={p.id}
                        className={`rounded-2xl p-3 border transition-all ${isProviderSelected
                            ? "bg-background/80 border-[var(--pitch)] shadow-[0_0_15px_-5px_var(--pitch)]"
                            : "bg-background/40 border-border/60 hover:border-border"
                          }`}
                      >
                        {/* Provider Header: Name, Qualities & Status on a single compact row */}
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {p.id === "matchora" && <GlobeIcon className="size-3.5 text-blue-400 shrink-0" />}
                            {p.id === "damitv" && <MonitorPlayIcon className="size-3.5 text-violet-400 shrink-0" />}
                            {p.id === "cinevid" && <TvMinimalPlayIcon className="size-3.5 text-rose-400 shrink-0" />}
                            {p.id === "live24" && <TvIcon className="size-3.5 text-emerald-400 shrink-0" />}
                            {p.id === "streamfree" && <SparklesIcon className="size-3.5 text-cyan-400 shrink-0" />}
                            {p.id === "daddylive" && <TvIcon className="size-3.5 text-amber-400 shrink-0" />}
                            {p.id === "zlive" && <RadioIcon className="size-3.5 text-emerald-400 shrink-0" />}
                            <span className="font-bold text-xs text-foreground truncate">{p.name}</span>
                            {p.qualities.length > 0 && (
                              <div className="flex items-center gap-1 shrink-0">
                                {p.qualities.slice(0, 2).map((q) => (
                                  <span key={q} className="text-[9px] font-mono font-bold px-1 rounded bg-white/10 text-muted-foreground">
                                    {q}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-[var(--pitch)]/10 text-[var(--pitch)] shrink-0">
                            {p.status}
                          </span>
                        </div>

                        {/* Individual Sources Pills */}
                        {(() => {
                          const isExpanded = Boolean(expandedProviders[p.id])
                          const MAX_SIDEBAR_SOURCES = 4
                          let visibleSources = p.sources
                          if (!isExpanded && p.sources.length > MAX_SIDEBAR_SOURCES) {
                            const activeIdx = p.sources.findIndex((s) => s.key === currentSource?.key)
                            if (activeIdx >= MAX_SIDEBAR_SOURCES) {
                              visibleSources = [
                                p.sources[activeIdx],
                                ...p.sources.slice(0, MAX_SIDEBAR_SOURCES - 1).filter((s) => s.key !== currentSource?.key),
                              ]
                            } else {
                              visibleSources = p.sources.slice(0, MAX_SIDEBAR_SOURCES)
                            }
                          }

                          return (
                            <div>
                              <div
                                className={`flex flex-wrap gap-1.5 pt-0.5 ${isExpanded ? "max-h-52 overflow-y-auto pr-1" : ""
                                  }`}
                              >
                                {visibleSources.map((src) => {
                                  const isCurrent = currentSource?.key === src.key
                                  return (
                                    <button
                                      key={src.key}
                                      type="button"
                                      onClick={() => selectSource(p.id, src.key)}
                                      className={`px-2 py-0.5 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-all ${isCurrent
                                          ? "bg-[var(--pitch)] text-black font-bold shadow-sm"
                                          : "bg-card hover:bg-accent text-muted-foreground hover:text-foreground border border-border/70"
                                        }`}
                                    >
                                      {isCurrent && <CheckCircle2Icon className="size-2.5 stroke-[3]" />}
                                      <span>{src.label}</span>
                                    </button>
                                  )
                                })}
                              </div>

                              {p.sources.length > MAX_SIDEBAR_SOURCES && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedProviders((prev) => ({
                                      ...prev,
                                      [p.id]: !prev[p.id],
                                    }))
                                  }
                                  className="mt-1.5 text-[10px] font-bold text-[var(--pitch)] hover:underline inline-flex items-center gap-1 transition-colors"
                                >
                                  {isExpanded ? (
                                    <>
                                      <span>Show Less</span>
                                      <ChevronUpIcon className="size-2.5" />
                                    </>
                                  ) : (
                                    <>
                                      <span>+ View {p.sources.length - MAX_SIDEBAR_SOURCES} More</span>
                                      <ChevronDownIcon className="size-2.5" />
                                    </>
                                  )}
                                </button>
                              )}
                            </div>
                          )
                        })()}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* 2. MATCH CENTRE SHORTCUTS PANEL (Compacted) */}
            {fixture && (
              <div className="surface bg-card rounded-3xl p-4 sm:p-4.5 border border-border/70 flex flex-col gap-3">
                <div className="flex items-center gap-2 border-b border-border/50 pb-2.5">
                  <BarChart3Icon className="size-4 text-[var(--pitch)]" />
                  <h3
                    className="font-bold text-xs sm:text-sm uppercase tracking-wider text-foreground"
                    style={{ fontFamily: "var(--font-condensed)" }}
                  >
                    MATCH HUB
                  </h3>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Link
                    href={`/predictions/match?id=${fixture.event_id}`}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-background/50 hover:bg-accent text-xs font-semibold text-foreground border border-border/50 transition-all hover:translate-x-1 group"
                  >
                    <span className="flex items-center gap-2">
                      <BarChart3Icon className="size-3.5 text-[var(--pitch)]" />
                      <span>Predictions &amp; H2H</span>
                    </span>
                    <ArrowRightIcon className="size-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
                  </Link>

                  <Link
                    href={`/teams/compare?team1=${fixture.home_id}&team2=${fixture.away_id}`}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-background/50 hover:bg-accent text-xs font-semibold text-foreground border border-border/50 transition-all hover:translate-x-1 group"
                  >
                    <span className="flex items-center gap-2">
                      <LayersIcon className="size-3.5 text-cyan-400" />
                      <span>Team Comparison</span>
                    </span>
                    <ArrowRightIcon className="size-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
                  </Link>

                  <Link
                    href="/live"
                    className="flex items-center justify-between p-2.5 rounded-xl bg-background/50 hover:bg-accent text-xs font-semibold text-foreground border border-border/50 transition-all hover:translate-x-1 group"
                  >
                    <span className="flex items-center gap-2">
                      <TvMinimalPlayIcon className="size-3.5 text-emerald-400" />
                      <span>All Live Fixtures</span>
                    </span>
                    <ArrowRightIcon className="size-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
                  </Link>
                </div>
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  )
}

