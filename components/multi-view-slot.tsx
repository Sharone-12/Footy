"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import {
  TvIcon,
  AlertCircleIcon,
  RefreshCwIcon,
  Maximize2Icon,
  ArrowLeftRightIcon,
  XIcon,
  SearchIcon,
  PlayIcon,
  RadioIcon,
  ClockIcon,
  SparklesIcon,
} from "lucide-react"
import { TeamCrest, LeagueCrest } from "@/components/player-avatar"
import type { LiveFixture } from "@/components/live-sections"
import type { ZLiveChannel } from "@/lib/zlive/types"
import type { StreamingProviderId } from "@/lib/streaming/types"
import {
  buildProviders,
  resolveSource,
  type WatchProvider,
  type WatchSource,
  type StreamBundle,
} from "@/lib/streaming/resolve"
import { isProviderEnabled } from "@/lib/streaming/config"
import type { MatchedStream } from "@/lib/streamfree/types"
import type { MatchedZLive } from "@/lib/zlive/types"
import type { MatchedDaddyLive } from "@/lib/daddylive/types"
import type { MatchedDamiTv } from "@/lib/damitv/types"
import type { MatchedCinevid } from "@/lib/cinevid/types"
import type { MatchedLive24 } from "@/lib/live24/types"
import type { MatchedMatchora } from "@/lib/matchora/types"

export type MultiViewSlotData = {
  id: string
  title: string
  subtitle?: string
  streamUrl: string
  providerName?: string
  providerId?: StreamingProviderId | null
  quality?: string
  fixture?: LiveFixture | null
  channel?: ZLiveChannel | null
  sourceKey?: string | null
}

export async function fetchBestStreamForFixture(fixture: LiveFixture): Promise<{
  url: string
  providerName: string
  sourceKey: string
  providerId: StreamingProviderId
  quality?: string
} | null> {
  const fixtureId = fixture.event_id
  if (!fixtureId) return null

  try {
    const promises: Promise<Response>[] = [
      fetch(`/api/streams/matchora?fixture_id=${fixtureId}`).catch((e) => new Response(JSON.stringify({ error: String(e) }), { status: 500 })),
      fetch(`/api/streamfree?fixture_id=${fixtureId}`).catch((e) => new Response(JSON.stringify({ error: String(e) }), { status: 500 })),
      fetch(`/api/zlive?fixture_id=${fixtureId}`).catch((e) => new Response(JSON.stringify({ error: String(e) }), { status: 500 })),
      fetch(`/api/streams/daddylive?fixture_id=${fixtureId}`).catch((e) => new Response(JSON.stringify({ error: String(e) }), { status: 500 })),
      fetch(`/api/streams/damitv?fixture_id=${fixtureId}`).catch((e) => new Response(JSON.stringify({ error: String(e) }), { status: 500 })),
      fetch(`/api/streams/cinevid?fixture_id=${fixtureId}`).catch((e) => new Response(JSON.stringify({ error: String(e) }), { status: 500 })),
      fetch(`/api/streams/live24?fixture_id=${fixtureId}`).catch((e) => new Response(JSON.stringify({ error: String(e) }), { status: 500 })),
    ]

    const [moRes, sfRes, zlRes, dlRes, dtRes, cvRes, l24Res] = await Promise.all(promises)

    let moData: { event?: any; matched?: boolean; confidence?: number; channel?: any } = {}
    let sfData: { stream?: MatchedStream } = {}
    let zlData: { channel?: ZLiveChannel; match?: MatchedZLive; matched?: boolean } = {}
    let dlData: { match?: MatchedDaddyLive; channels?: any[]; matched?: boolean } = {}
    let dtData: { stream?: any; match?: MatchedDamiTv; matched?: boolean } = {}
    let cvData: { event?: any; matched?: boolean; confidence?: number; isConfirmedMatch?: boolean } = {}
    let l24Data: { event?: any; matched?: boolean; matchConfidence?: number; isConfirmedMatch?: boolean } = {}

    if (moRes.ok) try { moData = await moRes.json() } catch {}
    if (sfRes.ok) try { sfData = await sfRes.json() } catch {}
    if (zlRes.ok) try { zlData = await zlRes.json() } catch {}
    if (dlRes.ok) try { dlData = await dlRes.json() } catch {}
    if (dtRes.ok) try { dtData = await dtRes.json() } catch {}
    if (cvRes.ok) try { cvData = await cvRes.json() } catch {}
    if (l24Res.ok) try { l24Data = await l24Res.json() } catch {}

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
            event_id: Number(fixtureId),
          }
        : null

    const l24Match: MatchedLive24 | null =
      l24Data.matched && l24Data.event
        ? {
            event: l24Data.event,
            matchConfidence: l24Data.matchConfidence ?? 85,
            isConfirmedMatch: Boolean(l24Data.isConfirmedMatch ?? true),
            event_id: Number(fixtureId),
            fixture: {
              home: fixture.home || "",
              away: fixture.away || "",
              league: fixture.league || "",
            },
          }
        : null

    const bundle: StreamBundle = {
      matchora: isProviderEnabled("matchora") ? moMatch : null,
      streamFree: isProviderEnabled("streamfree") ? sfMatch : null,
      zLive: isProviderEnabled("zlive") ? zlMatch : null,
      daddyLive: isProviderEnabled("daddylive") ? dlMatch : null,
      damiTv: isProviderEnabled("damitv") ? dtMatch : null,
      cinevid: isProviderEnabled("cinevid") ? cvMatch : null,
      live24: isProviderEnabled("live24") ? l24Match : null,
    }

    const providers = buildProviders(bundle)
    const active = resolveSource(providers, null, null)

    if (active?.source?.url) {
      return {
        url: active.source.url,
        providerName: active.provider.name,
        sourceKey: active.source.key,
        providerId: active.provider.id,
        quality: active.source.quality,
      }
    }
    return null
  } catch (err) {
    console.error("[fetchBestStreamForFixture] error:", err)
    return null
  }
}

export type MultiViewSlotPlayerProps = {
  slotIndex: number
  slotData: MultiViewSlotData | null
  similarMatches: LiveFixture[]
  genericChannels: ZLiveChannel[]
  alternateSources: { provider: WatchProvider; source: WatchSource }[]
  onSelectStream: (slotIndex: number, data: MultiViewSlotData) => void
  onClearSlot: (slotIndex: number) => void
  onSwapWithMain: (slotIndex: number) => void
  onSoloSlot: (slotIndex: number) => void
  isFocused?: boolean
  isFullscreen?: boolean
  onFocus?: () => void
}

export function MultiViewSlotPlayer({
  slotIndex,
  slotData,
  similarMatches,
  genericChannels,
  alternateSources,
  onSelectStream,
  onClearSlot,
  onSwapWithMain,
  onSoloSlot,
  isFocused,
  isFullscreen,
  onFocus,
}: MultiViewSlotPlayerProps) {
  const [activeTab, setActiveTab] = useState<"matches" | "channels" | "sources">("matches")
  const [searchQuery, setSearchQuery] = useState("")
  const [isLoadingStream, setIsLoadingStream] = useState(false)
  const [streamError, setStreamError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [daddyLiveClean, setDaddyLiveClean] = useState(true)
  const [isEditingFeed, setIsEditingFeed] = useState(false)

  const feedLabel = `FEED ${slotIndex + 1}`

  const handlePickChannel = useCallback(
    (ch: ZLiveChannel) => {
      setIsEditingFeed(false)
      onSelectStream(slotIndex, {
        id: `ch-${ch.id}`,
        title: ch.name,
        subtitle: ch.region || "Broadcaster",
        streamUrl: `https://streamembed.net/live/${ch.id}`,
        providerName: "ZLive 24/7",
        providerId: "zlive",
        channel: ch,
      })
    },
    [onSelectStream, slotIndex],
  )

  const handlePickSource = useCallback(
    (item: { provider: WatchProvider; source: WatchSource }) => {
      setIsEditingFeed(false)
      onSelectStream(slotIndex, {
        id: `src-${item.source.key}`,
        title: item.source.label,
        subtitle: `via ${item.provider.name}`,
        streamUrl: item.source.url,
        providerName: item.provider.name,
        providerId: item.provider.id,
        quality: item.source.quality,
        sourceKey: item.source.key,
      })
    },
    [onSelectStream, slotIndex],
  )

  const handlePickFixture = useCallback(
    async (fix: LiveFixture) => {
      setIsLoadingStream(true)
      setStreamError(null)
      try {
        const best = await fetchBestStreamForFixture(fix)
        if (best?.url) {
          setIsEditingFeed(false)
          onSelectStream(slotIndex, {
            id: `fix-${fix.event_id}`,
            title: `${fix.home} vs ${fix.away}`,
            subtitle: fix.league || "Live Match",
            streamUrl: best.url,
            providerName: best.providerName,
            providerId: best.providerId,
            quality: best.quality,
            fixture: fix,
            sourceKey: best.sourceKey,
          })
        } else {
          setStreamError(`No live stream feed found yet for ${fix.home} vs ${fix.away}. Select a 24/7 broadcaster channel below.`)
        }
      } catch {
        setStreamError("Failed to resolve stream feed for fixture.")
      } finally {
        setIsLoadingStream(false)
      }
    },
    [onSelectStream, slotIndex],
  )

  const filteredMatches = useMemo(() => {
    if (!searchQuery.trim()) return similarMatches
    const q = searchQuery.toLowerCase()
    return similarMatches.filter(
      (m) =>
        m.home.toLowerCase().includes(q) ||
        m.away.toLowerCase().includes(q) ||
        (m.league && m.league.toLowerCase().includes(q)),
    )
  }, [similarMatches, searchQuery])

  const filteredChannels = useMemo(() => {
    if (!searchQuery.trim()) return genericChannels
    const q = searchQuery.toLowerCase()
    return genericChannels.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.region && c.region.toLowerCase().includes(q)),
    )
  }, [genericChannels, searchQuery])

  const filteredSources = useMemo(() => {
    if (!searchQuery.trim()) return alternateSources
    const q = searchQuery.toLowerCase()
    return alternateSources.filter(
      (s) =>
        s.source.label.toLowerCase().includes(q) ||
        s.provider.name.toLowerCase().includes(q),
    )
  }, [alternateSources, searchQuery])

  if (!slotData || isEditingFeed) {
    return (
      <article
        aria-label={`${feedLabel} Selection`}
        onClick={onFocus}
        className={`relative ${
          isFullscreen ? "w-full h-full min-h-0" : "aspect-video min-h-[260px] w-full"
        } rounded-2xl overflow-hidden bg-neutral-950/95 border flex flex-col p-3 sm:p-4 transition-all duration-200 ${
          isFocused ? "border-[var(--pitch)] ring-1 ring-[var(--pitch)]/30" : "border-white/10 hover:border-white/20"
        }`}
      >
        <header className="flex items-center justify-between pb-2 border-b border-white/[0.08] shrink-0">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-md bg-white/[0.08] text-foreground text-[10px] font-black uppercase tracking-wider">
              {feedLabel}
            </span>
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {isEditingFeed ? "CHANGE STREAM" : "ADD STREAM"}
            </span>
            {isEditingFeed && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setIsEditingFeed(false)
                }}
                className="px-2 py-0.5 rounded text-[10px] font-bold text-muted-foreground hover:text-foreground bg-white/10"
              >
                Cancel
              </button>
            )}
          </div>

          <nav aria-label="Stream categories" className="flex items-center gap-1 bg-white/[0.04] p-0.5 rounded-lg border border-white/[0.06]">
            <button
              type="button"
              onClick={() => setActiveTab("matches")}
              className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase transition-all ${
                activeTab === "matches"
                  ? "bg-white/15 text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Matches ({similarMatches.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("channels")}
              className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase transition-all ${
                activeTab === "channels"
                  ? "bg-white/15 text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              24/7 ({genericChannels.length})
            </button>
            {alternateSources.length > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab("sources")}
                className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase transition-all ${
                  activeTab === "sources"
                    ? "bg-white/15 text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Feeds ({alternateSources.length})
              </button>
            )}
          </nav>
        </header>

        {isLoadingStream && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/90 backdrop-blur-xs p-4 text-center">
            <div className="size-8 rounded-full border-2 border-white/10 border-t-[var(--pitch)] animate-spin mb-2" />
            <span className="text-xs font-bold text-foreground">CONNECTING FEED...</span>
            <span className="text-[11px] text-muted-foreground mt-1">
              Resolving provider video streams for {feedLabel}
            </span>
          </div>
        )}

        {streamError && (
          <div className="my-2 p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-[11px] flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-1.5 truncate">
              <AlertCircleIcon className="size-3.5 shrink-0 text-rose-400" />
              <span className="truncate">{streamError}</span>
            </div>
            <button
              type="button"
              onClick={() => setStreamError(null)}
              className="text-[10px] text-muted-foreground hover:text-foreground"
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="mt-2.5 mb-2 relative shrink-0">
          <SearchIcon className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              activeTab === "matches"
                ? "Search matches or leagues..."
                : activeTab === "channels"
                ? "Search TV channels..."
                : "Search feeds..."
            }
            className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/10 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-[var(--pitch)]/60 transition-colors"
          />
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 space-y-1.5 pr-1">
          {activeTab === "matches" && (
            <>
              {filteredMatches.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full p-4 text-center text-muted-foreground text-xs">
                  <RadioIcon className="size-6 mb-1 opacity-50" />
                  <span>No concurrent matches found</span>
                </div>
              ) : (
                filteredMatches.map((m) => (
                  <button
                    key={m.event_id}
                    type="button"
                    onClick={() => handlePickFixture(m)}
                    className="w-full flex items-center justify-between p-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.06] hover:border-[var(--pitch)]/40 transition-all text-left group"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="flex items-center -space-x-1.5 shrink-0">
                        {m.home_id && <TeamCrest teamId={m.home_id} name={m.home} size={20} />}
                        {m.away_id && <TeamCrest teamId={m.away_id} name={m.away} size={20} />}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-semibold text-foreground truncate group-hover:text-[var(--pitch)] transition-colors">
                          {m.home} vs {m.away}
                        </span>
                        <span className="text-[10px] text-muted-foreground truncate">
                          {m.league || "Live Match"}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[var(--pitch)]/10 text-[var(--pitch)] border border-[var(--pitch)]/20">
                        + Watch
                      </span>
                    </div>
                  </button>
                ))
              )}
            </>
          )}

          {activeTab === "channels" && (
            <>
              {filteredChannels.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full p-4 text-center text-muted-foreground text-xs">
                  <TvIcon className="size-6 mb-1 opacity-50" />
                  <span>No channels found</span>
                </div>
              ) : (
                filteredChannels.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handlePickChannel(c)}
                    className="w-full flex items-center justify-between p-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.06] hover:border-[var(--pitch)]/40 transition-all text-left group"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="size-6 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                        <TvIcon className="size-3 text-muted-foreground group-hover:text-[var(--pitch)]" />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-semibold text-foreground truncate group-hover:text-[var(--pitch)] transition-colors">
                          {c.name}
                        </span>
                        <span className="text-[10px] text-muted-foreground truncate">
                          {c.region || "Broadcaster"}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[var(--pitch)]/10 text-[var(--pitch)] border border-[var(--pitch)]/20">
                        + Watch
                      </span>
                    </div>
                  </button>
                ))
              )}
            </>
          )}

          {activeTab === "sources" && (
            <>
              {filteredSources.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full p-4 text-center text-muted-foreground text-xs">
                  <PlayIcon className="size-6 mb-1 opacity-50" />
                  <span>No alternate feeds</span>
                </div>
              ) : (
                filteredSources.map((s) => (
                  <button
                    key={`${s.provider.id}-${s.source.key}`}
                    type="button"
                    onClick={() => handlePickSource(s)}
                    className="w-full flex items-center justify-between p-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.06] hover:border-[var(--pitch)]/40 transition-all text-left group"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-semibold text-foreground truncate group-hover:text-[var(--pitch)] transition-colors">
                          {s.source.label}
                        </span>
                        <span className="text-[10px] text-muted-foreground truncate">
                          via {s.provider.name}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      {s.source.quality && (
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/10 text-foreground font-bold">
                          {s.source.quality}
                        </span>
                      )}
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[var(--pitch)]/10 text-[var(--pitch)] border border-[var(--pitch)]/20">
                        + Watch
                      </span>
                    </div>
                  </button>
                ))
              )}
            </>
          )}
        </div>
      </article>
    )
  }

  return (
    <article
      aria-label={`${feedLabel}: ${slotData.title}`}
      onClick={onFocus}
      className={`relative ${
        isFullscreen ? "w-full h-full min-h-0" : "aspect-video w-full"
      } rounded-2xl overflow-hidden bg-black border flex flex-col group transition-all duration-200 ${
        isFocused ? "border-[var(--pitch)] ring-1 ring-[var(--pitch)]/30" : "border-white/10 hover:border-white/20"
      }`}
    >
      <header className="flex items-center justify-between px-2.5 sm:px-3 py-1.5 bg-gradient-to-b from-neutral-950 via-neutral-950/90 to-neutral-950/70 border-b border-white/[0.08] z-20 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="px-1.5 py-0.5 rounded-md bg-white/[0.08] text-[var(--pitch)] text-[9px] font-black uppercase tracking-wider shrink-0 flex items-center gap-1">
            <span className="size-1.5 rounded-full bg-[var(--pitch)] inline-block shadow-[0_0_6px_var(--pitch)] animate-pulse" />
            {feedLabel}
          </span>
          {isFocused && (
            <span className="hidden sm:inline-block px-1 py-0.2 rounded text-[8px] font-black uppercase tracking-wider bg-[var(--pitch)]/20 text-[var(--pitch)] border border-[var(--pitch)]/40">
              AUDIO FOCUS
            </span>
          )}
          <span className="text-xs font-semibold text-foreground truncate max-w-[140px] sm:max-w-xs">
            {slotData.title}
          </span>
          {slotData.providerName && (
            <span className="hidden sm:inline-block text-[10px] text-muted-foreground truncate">
              ({slotData.providerName})
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {slotData.providerId === "daddylive" && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setDaddyLiveClean((prev) => !prev)
              }}
              className={`p-1 rounded-md text-[10px] font-bold transition-colors ${
                daddyLiveClean
                  ? "text-[var(--pitch)] bg-[var(--pitch)]/10"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/10"
              }`}
              title={daddyLiveClean ? "Clean View Active (Cropped)" : "Native Player Bar Active"}
            >
              <SparklesIcon className="size-3.5" />
            </button>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setIsEditingFeed(true)
            }}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
            title="Change Feed"
          >
            <TvIcon className="size-3.5" />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onSwapWithMain(slotIndex)
            }}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
            title="Swap with Main Feed (Feed 1)"
          >
            <ArrowLeftRightIcon className="size-3.5" />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onSoloSlot(slotIndex)
            }}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
            title="Solo this Feed (Switch to Single View)"
          >
            <Maximize2Icon className="size-3.5" />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setReloadKey((k) => k + 1)
            }}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
            title="Reload Feed"
          >
            <RefreshCwIcon className="size-3.5" />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onClearSlot(slotIndex)
            }}
            className="p-1 rounded-md text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
            title="Close Feed"
          >
            <XIcon className="size-3.5" />
          </button>
        </div>
      </header>

      <div className="relative w-full h-full flex-1 bg-black overflow-hidden flex items-center justify-center">
        <iframe
          key={`${slotData.streamUrl}-${reloadKey}`}
          src={slotData.streamUrl}
          title={`${feedLabel} — ${slotData.title}`}
          className={`border-0 bg-black block transition-all ${
            slotData.providerId === "zlive"
              ? "w-full h-full scale-[1.035] origin-center"
              : slotData.providerId === "daddylive" && daddyLiveClean
              ? "absolute top-0 inset-x-0 w-full h-[calc(100%+62px)] max-h-none"
              : "w-full h-full"
          }`}
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
          allowFullScreen
          referrerPolicy="no-referrer"
        />
      </div>
    </article>
  )
}

