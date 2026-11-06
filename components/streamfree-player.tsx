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
  CheckCircle2Icon,
} from "lucide-react"
import type { MatchedStream, StreamFreeQuality, StreamFreeSource } from "@/lib/streamfree/types"

export function StreamFreePlayer({
  stream,
  onClose,
  initialQuality,
}: {
  stream: MatchedStream
  onClose?: () => void
  initialQuality?: StreamFreeQuality
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)

  // Pick initial source based on preferred quality or bestSource
  const defaultQuality =
    initialQuality ||
    stream.bestSource?.quality ||
    stream.availableQualities[0] ||
    "HD"

  const [selectedQuality, setSelectedQuality] = useState<StreamFreeQuality>(defaultQuality)

  const activeSource: StreamFreeSource | undefined =
    stream.sources.find((s) => s.quality.toLowerCase() === selectedQuality.toLowerCase()) ||
    stream.bestSource ||
    stream.sources[0]

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

  function handleQualitySwitch(q: StreamFreeQuality) {
    if (q === selectedQuality) return
    setSelectedQuality(q)
    setIsLoading(true)
    setHasError(false)
  }

  function handleRetry() {
    setIsLoading(true)
    setHasError(false)
  }

  const isLive = stream.isLive || activeSource?.live === true

  return (
    <div
      ref={containerRef}
      className={`relative flex flex-col surface bg-card border border-border rounded-2xl overflow-hidden shadow-2xl transition-all ${
        isFullscreen ? "h-screen w-screen rounded-none border-0" : "w-full max-w-4xl mx-auto"
      }`}
    >
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-card/90 border-b border-border/80 backdrop-blur-md z-20">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex items-center gap-1.5 shrink-0">
            {isLive ? (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[0.65rem] font-bold bg-[var(--pitch)]/15 text-[var(--pitch)] border border-[var(--pitch)]/30">
                <span className="relative flex size-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--pitch)] opacity-75 motion-reduce:hidden" />
                  <span className="relative inline-flex rounded-full size-1.5 bg-[var(--pitch)]" />
                </span>
                LIVE
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-[0.65rem] font-bold bg-muted text-muted-foreground">
                {stream.status}
              </span>
            )}
          </div>
          <h3
            className="text-sm font-semibold truncate text-foreground"
            style={{ fontFamily: "var(--font-condensed)" }}
          >
            {stream.title}
          </h3>
          {stream.league && (
            <span className="hidden sm:inline-block text-xs text-muted-foreground truncate">
              · {stream.league}
            </span>
          )}
        </div>

        {/* Quality switch & player actions */}
        <div className="flex items-center gap-2 shrink-0">
          {stream.availableQualities.length > 1 && (
            <div className="flex items-center bg-black/40 rounded-lg p-0.5 border border-border/50 text-xs">
              {stream.availableQualities.map((q) => {
                const isSelected = q.toLowerCase() === selectedQuality.toLowerCase()
                return (
                  <button
                    key={q}
                    type="button"
                    onClick={() => handleQualitySwitch(q)}
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

      {/* Video Viewport */}
      <div className="relative aspect-video w-full bg-black flex items-center justify-center overflow-hidden">
        {isLoading && !hasError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 z-10 text-muted-foreground">
            <RefreshCwIcon className="size-8 animate-spin text-[var(--pitch)] motion-reduce:hidden" />
            <span className="text-xs font-medium tracking-wide">Connecting to stream ({selectedQuality})...</span>
          </div>
        )}

        {hasError || !activeSource ? (
          <div className="flex flex-col items-center justify-center p-6 text-center gap-3 z-10 max-w-md">
            <AlertCircleIcon className="size-10 text-amber-500" />
            <div>
              <p className="font-semibold text-sm text-foreground">Stream Currently Unavailable</p>
              <p className="text-xs text-muted-foreground mt-1">
                The stream source might be offline, expired, or temporarily restricted by the provider.
              </p>
            </div>
            <div className="flex items-center gap-3 mt-2">
              <button
                type="button"
                onClick={handleRetry}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-foreground transition-colors"
              >
                <RefreshCwIcon className="size-3.5" />
                Retry Source
              </button>
              {activeSource?.url && (
                <a
                  href={activeSource.url}
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
            key={activeSource.url}
            src={activeSource.url}
            title={stream.title}
            onLoad={() => setIsLoading(false)}
            onError={() => {
              setIsLoading(false)
              setHasError(true)
            }}
            loading="lazy"
            referrerPolicy="no-referrer"
            allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
            allowFullScreen
            className="absolute inset-0 h-full w-full border-0"
          />
        )}
      </div>

      {/* Footer bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-card text-xs text-muted-foreground border-t border-border">
        <div className="flex items-center gap-2">
          <TvMinimalPlayIcon className="size-3.5 text-muted-foreground" />
          <span>StreamFree Live Gateway</span>
          <span className="hidden sm:inline">· Quality: {activeSource?.quality ?? selectedQuality}</span>
        </div>

        {activeSource?.url && (
          <a
            href={activeSource.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <span>Direct Provider Link</span>
            <ExternalLinkIcon className="size-3" />
          </a>
        )}
      </div>
    </div>
  )
}

