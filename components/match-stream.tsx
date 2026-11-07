"use client"

import { useSyncExternalStore, useRef, useEffect } from "react"
import { ExternalLinkIcon, TvMinimalPlayIcon } from "lucide-react"
import { embedFor } from "@/lib/stream-embed"
import { YouTubePlayer } from "@/components/youtube-player"

// The hostname never changes, so there is nothing to subscribe to; the
// server/hydration snapshot is null and the client snapshot is the real host.
const subscribe = () => () => {}
const readHost = () => window.location.hostname
const noHost = () => null

/**
 * Embedded player for a match stream.
 *
 * Client-side because Twitch needs the hostname the page is served from, which
 * only exists in the browser. Server and hydration both resolve without it, so
 * a Twitch URL renders as a link and upgrades to a player once mounted,
 * instead of hydrating into a mismatch.
 */
export function MatchStream({
  url,
  title = "Match stream",
}: {
  url: string
  title?: string
}) {
  const host = useSyncExternalStore(subscribe, readHost, noHost)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    return () => {
      if (iframeRef.current) {
        try {
          iframeRef.current.src = "about:blank"
        } catch {}
      }
    }
  }, [])

  const embed = embedFor(url, host)
  if (!embed) return null

  if (embed.kind === "link") {
    return (
      <a
        href={embed.src}
        target="_blank"
        rel="noopener noreferrer"
        className="card-lift surface bg-card rounded-2xl px-4 py-3.5 flex items-center gap-3"
      >
        <TvMinimalPlayIcon
          className="size-5 shrink-0"
          style={{ color: "var(--pitch)" }}
          aria-hidden
        />
        <span className="min-w-0 flex-1">
          <span className="stat-label block text-xs">Watch on</span>
          <span className="block font-semibold text-[0.95rem] truncate">
            {embed.host}
          </span>
        </span>
        <ExternalLinkIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </a>
    )
  }

  // YouTube gets the custom bar; the other platforms keep their native chrome.
  if (embed.kind === "youtube") return <YouTubePlayer id={embed.id} title={title} />

  return (
    <div className="surface bg-card rounded-2xl overflow-hidden">
      <div className="relative aspect-video">
        <iframe
          ref={iframeRef}
          key={embed.src}
          src={embed.src}
          title={title}
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 h-full w-full border-0"
        />
      </div>
    </div>
  )
}
