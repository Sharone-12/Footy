"use client"

import { useState, useRef, useEffect } from "react"
import Image from "next/image"
import {
  Maximize2Icon,
  Minimize2Icon,
  ExternalLinkIcon,
  XIcon,
  GlobeIcon,
  TvMinimalPlayIcon,
  RefreshCwIcon,
  AlertCircleIcon,
  RadioIcon,
  SparklesIcon,
  TvIcon,
  MonitorPlayIcon,
  UsersIcon,
} from "lucide-react"
import type { MatchedStream, StreamFreeQuality, StreamFreeSource } from "@/lib/streamfree/types"
import type { MatchedZLive, ZLiveChannel } from "@/lib/zlive/types"
import type { MatchedDaddyLive, DaddyLiveChannel } from "@/lib/daddylive/types"
import type { MatchedDamiTv, DamiTvSource } from "@/lib/damitv/types"
import type { MatchedCinevid } from "@/lib/cinevid/types"
import type { MatchedMatchora, MatchoraParsedChannel } from "@/lib/matchora/types"
import type { StreamingProviderId } from "@/lib/streaming/types"

export type UnifiedPlayerProps = {
  fixtureTitle: string
  league?: string
  matchora?: MatchedMatchora | null
  streamFree?: MatchedStream | null
  zLive?: MatchedZLive | null
  daddyLive?: MatchedDaddyLive | null
  damiTv?: MatchedDamiTv | null
  cinevid?: MatchedCinevid | null
  genericChannel?: ZLiveChannel | null
  initialProvider?: StreamingProviderId
  onClose?: () => void
}

export function UnifiedPlayer({
  fixtureTitle,
  league,
  matchora,
  streamFree,
  zLive,
  daddyLive,
  damiTv,
  cinevid,
  genericChannel,
  initialProvider,
  onClose,
}: UnifiedPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)

  // Determine available providers
  const hasMatchora = Boolean(matchora && matchora.event?.embedUrl)
  const hasStreamFree = false // Unwired for testing
  const hasZLive = Boolean(zLive?.channel || genericChannel)
  const hasDaddyLive = Boolean(daddyLive && daddyLive.channels?.length > 0)
  const hasDamiTv = Boolean(damiTv && (damiTv.stream?.embedUrl || damiTv.stream?.sources?.length > 0))
  const hasCinevid = Boolean(cinevid && cinevid.event?.playerUrl)

  // Initial provider selection: Matchora & DAMITV are primary defaults, then Cinevid
  const defaultProvider: StreamingProviderId =
    initialProvider ??
    (hasMatchora
      ? "matchora"
      : hasDamiTv
      ? "damitv"
      : hasCinevid
      ? "cinevid"
      : hasStreamFree
      ? "streamfree"
      : hasDaddyLive
      ? "daddylive"
      : hasZLive
      ? "zlive"
      : "matchora")

  const [selectedProvider, setSelectedProvider] = useState<StreamingProviderId>(defaultProvider)

  // 0. Matchora active channel selection
  const [selectedMatchoraChannelId, setSelectedMatchoraChannelId] = useState<string>(
    matchora?.event?.channels?.[0]?.id || "",
  )

  const activeMatchoraChannel: MatchoraParsedChannel | undefined =
    matchora?.event?.channels?.find((ch) => ch.id === selectedMatchoraChannelId) ||
    matchora?.event?.channels?.[0]

  // 1. StreamFree quality selection
  const sfDefaultQuality =
    streamFree?.bestSource?.quality || streamFree?.availableQualities?.[0] || "HD"
  const [sfQuality, setSfQuality] = useState<StreamFreeQuality>(sfDefaultQuality)

  const activeSfSource: StreamFreeSource | undefined =
    streamFree?.sources?.find((s) => s.quality.toLowerCase() === sfQuality.toLowerCase()) ||
    streamFree?.bestSource ||
    streamFree?.sources?.[0]

  // 2. ZLive active channel
  const activeZLiveChannel: ZLiveChannel | undefined = zLive?.channel || genericChannel || undefined

  // 3. DaddyLive active channel selection
  const [selectedDaddyChannelId, setSelectedDaddyChannelId] = useState<string>(
    daddyLive?.channels?.[0]?.channel_id || "",
  )

  const activeDaddyChannel: DaddyLiveChannel | undefined =
    daddyLive?.channels?.find((ch) => ch.channel_id === selectedDaddyChannelId) ||
    daddyLive?.channels?.[0]

  // 4. DAMITV source selection
  const [selectedDamiSourceId, setSelectedDamiSourceId] = useState<string>(
    damiTv?.stream?.sources?.[0]?.id || "",
  )

  const activeDamiSource: DamiTvSource | undefined =
    damiTv?.stream?.sources?.find((src) => src.id === selectedDamiSourceId) ||
    damiTv?.activeSource ||
    damiTv?.stream?.sources?.[0]

  useEffect(() => {
    function onFullscreenChange() {
      setIsFullscreen(Boolean(document.fullscreenElement))
    }
    document.addEventListener("fullscreenchange", onFullscreenChange)
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange)
  }, [])

  function toggleFullscreen() {
    if (!containerRef.current) return
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {})
    } else {
      document.exitFullscreen().catch(() => {})
    }
  }

  function handleProviderSwitch(provider: StreamingProviderId) {
    if (provider === selectedProvider) return
    setSelectedProvider(provider)
    setIsLoading(true)
    setHasError(false)
  }

  function handleSfQualitySwitch(q: StreamFreeQuality) {
    if (q === sfQuality) return
    setSfQuality(q)
    setIsLoading(true)
    setHasError(false)
  }

  function handleMatchoraChannelSwitch(channelId: string) {
    if (channelId === selectedMatchoraChannelId) return
    setSelectedMatchoraChannelId(channelId)
    setIsLoading(true)
    setHasError(false)
  }

  function handleDaddyChannelSwitch(channelId: string) {
    if (channelId === selectedDaddyChannelId) return
    setSelectedDaddyChannelId(channelId)
    setIsLoading(true)
    setHasError(false)
  }

  function handleDamiSourceSwitch(sourceId: string) {
    if (sourceId === selectedDamiSourceId) return
    setSelectedDamiSourceId(sourceId)
    setIsLoading(true)
    setHasError(false)
  }

  function handleRetry() {
    setIsLoading(true)
    setHasError(false)
  }

  // Active stream URL and status depending on selected provider
  let currentUrl: string | undefined
  let isCurrentLive = false
  let currentStatusLabel = "LIVE"
  let providerDisplayName = "Matchora"

  if (selectedProvider === "matchora") {
    currentUrl = activeMatchoraChannel?.embedUrl || matchora?.event?.embedUrl
    isCurrentLive = Boolean(matchora?.event?.status === "live")
    currentStatusLabel = matchora?.event?.status === "live" ? "LIVE" : matchora?.event?.status === "finished" ? "OFFLINE" : "UPCOMING"
    providerDisplayName = activeMatchoraChannel?.name
      ? `Matchora · ${activeMatchoraChannel.name}`
      : "Matchora Main Player"
  } else if (selectedProvider === "streamfree") {
    currentUrl = activeSfSource?.url
    isCurrentLive = Boolean(streamFree?.isLive || activeSfSource?.live)
    currentStatusLabel = streamFree?.status ?? (isCurrentLive ? "LIVE" : "OFFLINE")
    providerDisplayName = "StreamFree"
  } else if (selectedProvider === "damitv") {
    currentUrl = activeDamiSource?.embed || damiTv?.stream?.embedUrl
    isCurrentLive = Boolean(damiTv?.stream?.isLive)
    currentStatusLabel = damiTv?.stream?.status ?? (isCurrentLive ? "LIVE" : "OFFLINE")
    providerDisplayName = activeDamiSource?.name
      ? `DAMITV · ${activeDamiSource.name}`
      : "DAMITV (OnDemand)"
  } else if (selectedProvider === "cinevid") {
    currentUrl = cinevid?.event?.playerUrl
    isCurrentLive = Boolean(cinevid?.event?.isLive)
    currentStatusLabel = cinevid?.event?.status ?? (isCurrentLive ? "LIVE" : "OFFLINE")
    providerDisplayName = cinevid?.event?.league
      ? `Cinevid · ${cinevid.event.league}`
      : "Cinevid"
  } else if (selectedProvider === "daddylive") {
    currentUrl = activeDaddyChannel?.player_url
    isCurrentLive = true
    currentStatusLabel = "LIVE"
    providerDisplayName = activeDaddyChannel?.channel_name
      ? `DaddyLive · ${activeDaddyChannel.channel_name}`
      : "DaddyLiveHD"
  } else {
    currentUrl =
      activeZLiveChannel?.url ||
      (activeZLiveChannel?.id ? `https://zlive.st/embed/${activeZLiveChannel.id}` : undefined)
    isCurrentLive = Boolean(activeZLiveChannel?.live)
    currentStatusLabel = isCurrentLive ? "LIVE" : "OFFLINE"
    providerDisplayName = activeZLiveChannel?.name
      ? `ZLive · ${activeZLiveChannel.name}`
      : "ZLive"
  }

  return (
    <div
      ref={containerRef}
      className={`relative flex flex-col surface bg-card border border-border rounded-2xl overflow-hidden shadow-2xl transition-all ${
        isFullscreen ? "h-screen w-screen rounded-none border-0" : "w-full max-w-4xl mx-auto"
      }`}
    >
      {/* Top Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 px-4 py-3 bg-card/90 border-b border-border/80 backdrop-blur-md z-20">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex items-center gap-1.5 shrink-0">
            {isCurrentLive ? (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[0.65rem] font-bold bg-[var(--pitch)]/15 text-[var(--pitch)] border border-[var(--pitch)]/30">
                <span className="relative flex size-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--pitch)] opacity-75 motion-reduce:hidden" />
                  <span className="relative inline-flex rounded-full size-1.5 bg-[var(--pitch)]" />
                </span>
                LIVE
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-[0.65rem] font-bold bg-muted text-muted-foreground">
                {currentStatusLabel}
              </span>
            )}
          </div>

          <h3
            className="text-sm font-semibold truncate text-foreground"
            style={{ fontFamily: "var(--font-condensed)" }}
          >
            {fixtureTitle}
          </h3>
          {league && (
            <span className="hidden sm:inline-block text-xs text-muted-foreground truncate">
              · {league}
            </span>
          )}
        </div>

        {/* Controls: 4-provider toggle, sources, qualities, fullscreen, close */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Provider selector pill */}
          {(hasMatchora || hasStreamFree || hasZLive || hasDaddyLive || hasDamiTv || hasCinevid) && (
            <div
              className="flex items-center bg-black/50 rounded-xl p-0.5 border border-border/60 text-xs shadow-inner overflow-x-auto no-scrollbar max-w-full"
              role="tablist"
              aria-label="Streaming Provider"
            >
              <button
                type="button"
                role="tab"
                aria-selected={selectedProvider === "matchora"}
                disabled={!hasMatchora}
                onClick={() => handleProviderSwitch("matchora")}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[0.7rem] font-bold transition-all ${
                  selectedProvider === "matchora"
                    ? "bg-white/20 text-white shadow-sm"
                    : hasMatchora
                    ? "text-muted-foreground hover:text-foreground"
                    : "opacity-35 cursor-not-allowed text-muted-foreground"
                }`}
              >
                <GlobeIcon className="size-3 text-blue-400" />
                Matchora
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={selectedProvider === "streamfree"}
                disabled={!hasStreamFree}
                onClick={() => handleProviderSwitch("streamfree")}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[0.7rem] font-bold transition-all ${
                  selectedProvider === "streamfree"
                    ? "bg-white/20 text-white shadow-sm"
                    : hasStreamFree
                    ? "text-muted-foreground hover:text-foreground"
                    : "opacity-35 cursor-not-allowed text-muted-foreground"
                }`}
              >
                <SparklesIcon className="size-3 text-cyan-400" />
                StreamFree
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={selectedProvider === "damitv"}
                disabled={!hasDamiTv}
                onClick={() => handleProviderSwitch("damitv")}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[0.7rem] font-bold transition-all ${
                  selectedProvider === "damitv"
                    ? "bg-white/20 text-white shadow-sm"
                    : hasDamiTv
                    ? "text-muted-foreground hover:text-foreground"
                    : "opacity-35 cursor-not-allowed text-muted-foreground"
                }`}
              >
                <MonitorPlayIcon className="size-3 text-violet-400" />
                DAMITV
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={selectedProvider === "cinevid"}
                disabled={!hasCinevid}
                onClick={() => handleProviderSwitch("cinevid")}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[0.7rem] font-bold transition-all ${
                  selectedProvider === "cinevid"
                    ? "bg-white/20 text-white shadow-sm"
                    : hasCinevid
                    ? "text-muted-foreground hover:text-foreground"
                    : "opacity-35 cursor-not-allowed text-muted-foreground"
                }`}
              >
                <TvIcon className="size-3 text-rose-400" />
                Cinevid
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={selectedProvider === "zlive"}
                disabled={!hasZLive}
                onClick={() => handleProviderSwitch("zlive")}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[0.7rem] font-bold transition-all ${
                  selectedProvider === "zlive"
                    ? "bg-white/20 text-white shadow-sm"
                    : hasZLive
                    ? "text-muted-foreground hover:text-foreground"
                    : "opacity-35 cursor-not-allowed text-muted-foreground"
                }`}
              >
                <RadioIcon className="size-3 text-emerald-400" />
                ZLive
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={selectedProvider === "daddylive"}
                disabled={!hasDaddyLive}
                onClick={() => handleProviderSwitch("daddylive")}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[0.7rem] font-bold transition-all ${
                  selectedProvider === "daddylive"
                    ? "bg-white/20 text-white shadow-sm"
                    : hasDaddyLive
                    ? "text-muted-foreground hover:text-foreground"
                    : "opacity-35 cursor-not-allowed text-muted-foreground"
                }`}
              >
                <TvIcon className="size-3 text-amber-400" />
                DaddyLive
              </button>
            </div>
          )}

          {/* DAMITV Source Variants selector */}
          {selectedProvider === "damitv" && damiTv?.stream?.sources && damiTv.stream.sources.length > 1 && (
            <div className="flex items-center bg-black/40 rounded-lg p-0.5 border border-border/50 text-xs">
              {damiTv.stream.sources.map((src) => {
                const isSelected = src.id === (activeDamiSource?.id || "")
                const badge = src.hd ? "HD" : src.sd ? "SD" : null
                return (
                  <button
                    key={src.id}
                    type="button"
                    onClick={() => handleDamiSourceSwitch(src.id)}
                    title={src.name}
                    className={`flex items-center gap-1 px-2 py-1 rounded-md text-[0.7rem] font-bold transition-all truncate max-w-[130px] ${
                      isSelected
                        ? "bg-violet-500/25 text-violet-300 shadow-sm border border-violet-500/40"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <span className="truncate">{src.name}</span>
                    {badge && (
                      <span className="text-[9px] px-1 rounded bg-black/40 text-violet-300 font-mono">
                        {badge}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}

          {/* Matchora Multi-channel selector */}
          {selectedProvider === "matchora" && matchora?.event?.channels && matchora.event.channels.length > 1 && (
            <div className="flex items-center bg-black/40 rounded-lg p-0.5 border border-border/50 text-xs overflow-x-auto max-w-[280px] sm:max-w-none">
              {matchora.event.channels.map((ch) => {
                const isSelected = ch.id === (activeMatchoraChannel?.id || "")
                return (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => handleMatchoraChannelSwitch(ch.id)}
                    title={ch.name}
                    className={`flex items-center gap-1 px-2 py-1 rounded-md text-[0.7rem] font-bold transition-all truncate shrink-0 ${
                      isSelected
                        ? "bg-blue-500/25 text-blue-300 shadow-sm border border-blue-500/40"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <span>{ch.country ? `${ch.country} ` : ""}{ch.name}</span>
                    {ch.quality && (
                      <span className="text-[9px] px-1 rounded bg-black/40 text-blue-300 font-mono">
                        {ch.quality}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}

          {/* DaddyLive Multi-channel dropdown/pill selector */}
          {selectedProvider === "daddylive" && daddyLive && daddyLive.channels.length > 1 && (
            <div className="flex items-center bg-black/40 rounded-lg p-0.5 border border-border/50 text-xs">
              {daddyLive.channels.map((ch) => {
                const isSelected = ch.channel_id === (activeDaddyChannel?.channel_id || "")
                return (
                  <button
                    key={ch.channel_id}
                    type="button"
                    onClick={() => handleDaddyChannelSwitch(ch.channel_id)}
                    title={ch.channel_name}
                    className={`px-2 py-1 rounded-md text-[0.7rem] font-bold transition-all truncate max-w-[120px] ${
                      isSelected
                        ? "bg-amber-500/25 text-amber-300 shadow-sm border border-amber-500/40"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {ch.channel_name}
                  </button>
                )
              })}
            </div>
          )}

          {/* Quality variants (StreamFree) */}
          {selectedProvider === "streamfree" && streamFree && streamFree.availableQualities?.length > 1 && (
            <div className="flex items-center bg-black/40 rounded-lg p-0.5 border border-border/50 text-xs">
              {streamFree.availableQualities.map((q) => {
                const isSelected = q.toLowerCase() === sfQuality.toLowerCase()
                return (
                  <button
                    key={q}
                    type="button"
                    onClick={() => handleSfQualitySwitch(q)}
                    className={`px-2 py-1 rounded-md text-[0.7rem] font-bold transition-all ${
                      isSelected
                        ? "bg-white/20 text-white shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {q}
                  </button>
                )
              })}
            </div>
          )}

          {/* Single quality badge for ZLive */}
          {selectedProvider === "zlive" && activeZLiveChannel?.quality && (
            <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-md text-[0.65rem] font-semibold bg-white/10 text-foreground border border-border/60">
              {activeZLiveChannel.quality}
            </span>
          )}

          {/* Quality badge for DAMITV if only 1 source */}
          {selectedProvider === "damitv" && activeDamiSource && (activeDamiSource.hd || activeDamiSource.sd) && (
            <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-md text-[0.65rem] font-semibold bg-violet-500/15 text-violet-300 border border-violet-500/30">
              {activeDamiSource.hd ? "HD" : "SD"}
            </span>
          )}

          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
          >
            {isFullscreen ? <Minimize2Icon className="size-4" /> : <Maximize2Icon className="size-4" />}
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close player"
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
            >
              <XIcon className="size-4" />
            </button>
          )}
        </div>
      </div>

      {/* Video Viewport Container */}
      <div className="relative aspect-video w-full bg-black flex items-center justify-center overflow-hidden">
        {isLoading && !hasError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/85 z-10 text-muted-foreground">
            <RefreshCwIcon className="size-8 animate-spin text-[var(--pitch)] motion-reduce:hidden" />
            <span className="text-xs font-medium tracking-wide">
              Connecting to {providerDisplayName}...
            </span>
          </div>
        )}

        {hasError || !currentUrl ? (
          <div className="flex flex-col items-center justify-center p-6 text-center gap-3 z-10 max-w-md">
            <AlertCircleIcon className="size-10 text-amber-500" />
            <div>
              <p className="font-semibold text-sm text-foreground">
                {selectedProvider === "matchora"
                  ? "Matchora Stream Unavailable"
                  : selectedProvider === "damitv"
                  ? "DAMITV Stream Unavailable"
                  : selectedProvider === "cinevid"
                  ? "Cinevid Stream Unavailable"
                  : selectedProvider === "daddylive"
                  ? "DaddyLive Channel Unavailable"
                  : selectedProvider === "zlive"
                  ? "ZLive Channel Unavailable"
                  : "StreamFree Source Unavailable"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                The stream may be offline, not yet started, or temporarily restricted. Try switching
                providers above or refreshing.
              </p>
            </div>
            <div className="flex items-center gap-3 mt-2">
              <button
                type="button"
                onClick={handleRetry}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-foreground transition-colors"
              >
                <RefreshCwIcon className="size-3.5" />
                Retry
              </button>
              {currentUrl && (
                <a
                  href={currentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--pitch)]/20 hover:bg-[var(--pitch)]/30 text-[var(--pitch)] text-xs font-semibold transition-colors"
                >
                  <ExternalLinkIcon className="size-3.5" />
                  Open in New Tab
                </a>
              )}
            </div>
          </div>
        ) : (
          <iframe
            key={`${selectedProvider}:${currentUrl}`}
            src={currentUrl}
            title={`${fixtureTitle} (${providerDisplayName})`}
            onLoad={() => setIsLoading(false)}
            onError={() => {
              setIsLoading(false)
              setHasError(true)
            }}
            loading="lazy"
            referrerPolicy="no-referrer"
            allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
            allowFullScreen
            style={{ border: 0 }}
            className="absolute inset-0 h-full w-full border-0"
          />
        )}
      </div>

      {/* Bottom Footer Info */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-card text-xs text-muted-foreground border-t border-border">
        <div className="flex items-center gap-2">
          {selectedProvider === "daddylive" && activeDaddyChannel?.logo_url ? (
            <Image
              src={activeDaddyChannel.logo_url}
              alt=""
              width={16}
              height={16}
              className="size-4 object-contain rounded"
              unoptimized
            />
          ) : (
            <TvMinimalPlayIcon className="size-3.5 text-muted-foreground" />
          )}
          <span>Active Provider: <strong className="text-foreground">{providerDisplayName}</strong></span>
          {selectedProvider === "streamfree" && (
            <span className="hidden sm:inline">· Quality: {activeSfSource?.quality ?? sfQuality}</span>
          )}
          {selectedProvider === "damitv" && (
            <>
              {activeDamiSource?.name && (
                <span className="hidden sm:inline">· Source: {activeDamiSource.name}</span>
              )}
              {damiTv?.stream?.viewers && (
                <span className="hidden sm:inline-flex items-center gap-1 text-[var(--pitch)] font-medium">
                  <UsersIcon className="size-3" />
                  {damiTv.stream.viewers.toLocaleString()} watching
                </span>
              )}
            </>
          )}
          {selectedProvider === "zlive" && activeZLiveChannel?.region && (
            <span className="hidden sm:inline">· Region: {activeZLiveChannel.region}</span>
          )}
          {selectedProvider === "daddylive" && activeDaddyChannel && (
            <span className="hidden sm:inline">· Channel #{activeDaddyChannel.channel_id}</span>
          )}
        </div>

        {currentUrl && (
          <a
            href={currentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <span>Direct Gateway</span>
            <ExternalLinkIcon className="size-3" />
          </a>
        )}
      </div>
    </div>
  )
}
