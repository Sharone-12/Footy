"use client"

import { useState, useRef, useEffect } from "react"
import {
  Maximize2Icon,
  Minimize2Icon,
  ExternalLinkIcon,
  XIcon,
  TvMinimalPlayIcon,
  RefreshCwIcon,
  AlertCircleIcon,
  RadioIcon,
  SparklesIcon,
} from "lucide-react"
import type { MatchedStream, StreamFreeQuality, StreamFreeSource } from "@/lib/streamfree/types"
import type { MatchedZLive, ZLiveChannel } from "@/lib/zlive/types"
import type { StreamingProviderId } from "@/lib/streaming/types"

export type UnifiedPlayerProps = {
  fixtureTitle: string
  league?: string
  streamFree?: MatchedStream | null
  zLive?: MatchedZLive | null
  genericChannel?: ZLiveChannel | null
  initialProvider?: StreamingProviderId
  onClose?: () => void
}

export function UnifiedPlayer({
  fixtureTitle,
  league,
  streamFree,
  zLive,
  genericChannel,
  initialProvider,
  onClose,
}: UnifiedPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)

  // Determine available providers
  const hasStreamFree = Boolean(streamFree && streamFree.sources?.length > 0)
  const hasZLive = Boolean(zLive?.channel || genericChannel)

  // Initial provider selection
  const defaultProvider: StreamingProviderId =
    initialProvider ?? (hasStreamFree ? "streamfree" : hasZLive ? "zlive" : "streamfree")

  const [selectedProvider, setSelectedProvider] = useState<StreamingProviderId>(defaultProvider)

  // StreamFree quality selection
  const sfDefaultQuality =
    streamFree?.bestSource?.quality || streamFree?.availableQualities?.[0] || "HD"
  const [sfQuality, setSfQuality] = useState<StreamFreeQuality>(sfDefaultQuality)

  const activeSfSource: StreamFreeSource | undefined =
    streamFree?.sources?.find((s) => s.quality.toLowerCase() === sfQuality.toLowerCase()) ||
    streamFree?.bestSource ||
    streamFree?.sources?.[0]

  // ZLive active channel
  const activeZLiveChannel: ZLiveChannel | undefined = zLive?.channel || genericChannel || undefined

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

  function handleRetry() {
    setIsLoading(true)
    setHasError(false)
  }

  // Active stream URL and status depending on selected provider
  const isStreamFree = selectedProvider === "streamfree"
  const currentUrl = isStreamFree
    ? activeSfSource?.url
    : activeZLiveChannel?.url || (activeZLiveChannel?.id ? `https://zlive.st/embed/${activeZLiveChannel.id}` : undefined)

  const isCurrentLive = isStreamFree
    ? Boolean(streamFree?.isLive || activeSfSource?.live)
    : Boolean(activeZLiveChannel?.live)

  const currentStatusLabel = isStreamFree
    ? streamFree?.status ?? (isCurrentLive ? "LIVE" : "OFFLINE")
    : isCurrentLive
    ? "LIVE"
    : "OFFLINE"

  const providerDisplayName = isStreamFree
    ? "StreamFree"
    : activeZLiveChannel?.name
    ? `ZLive · ${activeZLiveChannel.name}`
    : "ZLive"

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

        {/* Controls: provider toggle, qualities, fullscreen, close */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Provider selector pill: [ StreamFree ] [ ZLive ] */}
          {(hasStreamFree || hasZLive) && (
            <div
              className="flex items-center bg-black/50 rounded-xl p-0.5 border border-border/60 text-xs shadow-inner"
              role="tablist"
              aria-label="Streaming Provider"
            >
              <button
                type="button"
                role="tab"
                aria-selected={isStreamFree}
                disabled={!hasStreamFree}
                onClick={() => handleProviderSwitch("streamfree")}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[0.7rem] font-bold transition-all ${
                  isStreamFree
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
                aria-selected={!isStreamFree}
                disabled={!hasZLive}
                onClick={() => handleProviderSwitch("zlive")}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[0.7rem] font-bold transition-all ${
                  !isStreamFree
                    ? "bg-white/20 text-white shadow-sm"
                    : hasZLive
                    ? "text-muted-foreground hover:text-foreground"
                    : "opacity-35 cursor-not-allowed text-muted-foreground"
                }`}
              >
                <RadioIcon className="size-3 text-emerald-400" />
                ZLive
              </button>
            </div>
          )}

          {/* Quality variants (StreamFree) */}
          {isStreamFree && streamFree && streamFree.availableQualities?.length > 1 && (
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
          {!isStreamFree && activeZLiveChannel?.quality && (
            <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-md text-[0.65rem] font-semibold bg-white/10 text-foreground border border-border/60">
              {activeZLiveChannel.quality}
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
              Connecting to {isStreamFree ? `StreamFree (${sfQuality})` : "ZLive"}...
            </span>
          </div>
        )}

        {hasError || !currentUrl ? (
          <div className="flex flex-col items-center justify-center p-6 text-center gap-3 z-10 max-w-md">
            <AlertCircleIcon className="size-10 text-amber-500" />
            <div>
              <p className="font-semibold text-sm text-foreground">
                {isStreamFree ? "StreamFree Source Unavailable" : "ZLive Channel Unavailable"}
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
          <TvMinimalPlayIcon className="size-3.5 text-muted-foreground" />
          <span>Active Provider: <strong className="text-foreground">{providerDisplayName}</strong></span>
          {isStreamFree && (
            <span className="hidden sm:inline">· Quality: {activeSfSource?.quality ?? sfQuality}</span>
          )}
          {!isStreamFree && activeZLiveChannel?.region && (
            <span className="hidden sm:inline">· Region: {activeZLiveChannel.region}</span>
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
