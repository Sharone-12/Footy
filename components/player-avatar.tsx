"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import {
  playerImage,
  playerImageFallback,
  teamImage,
  teamImageFallback,
  leagueImage,
  leagueImageFallback,
  initials,
} from "@/lib/images"
import { TOP_10_FIFA_NATION_IDS } from "@/lib/teams"

/**
 * Global cache of verified working and failed image URLs.
 * Survives component unmounts, route transitions, and carousel sliding.
 */
const failedUrls = new Set<string>()
const workingUrls = new Map<string, string>()

/** Preload an image URL into the browser HTTP / memory cache with no-referrer */
export function preloadImage(url: string | null | undefined) {
  if (typeof window === "undefined" || !url || failedUrls.has(url)) return
  const img = new Image()
  img.referrerPolicy = "no-referrer"
  img.src = url
}

/**
 * Tries the Supabase mirror, then Sofascore direct, then gives up.
 *
 * referrerPolicy="no-referrer" is load-bearing for the Sofascore step, not a
 * nicety: Cloudflare 403s those when the request carries our own domain as the
 * referer. Plain <img> rather than next/image because the images are already
 * 150x150 / ~7 KB and the fallback host isn't in remotePatterns.
 */
function useFallbackChain(sources: string[], cacheKey?: string) {
  const initialIndex = useMemo(() => {
    if (cacheKey && workingUrls.has(cacheKey)) {
      const known = workingUrls.get(cacheKey)!
      const idx = sources.indexOf(known)
      if (idx !== -1) return idx
    }
    const firstValid = sources.findIndex((s) => !failedUrls.has(s))
    return firstValid !== -1 ? firstValid : 0
  }, [sources, cacheKey])

  const [step, setStep] = useState(initialIndex)
  const ref = useRef<HTMLImageElement>(null)

  const next = () => {
    if (step < sources.length) {
      failedUrls.add(sources[step])
    }
    setStep((s) => s + 1)
  }

  const onLoad = () => {
    if (cacheKey && step < sources.length) {
      workingUrls.set(cacheKey, sources[step])
    }
  }

  // These pages are server-rendered, so the browser starts (and can finish)
  // loading the <img> before React hydrates. A failure in that window never
  // fires onError — the handler isn't attached yet — which silently stranded
  // the chain on a dead source. complete && naturalWidth === 0 is the only
  // way to spot an already-failed image after the fact.
  useEffect(() => {
    const el = ref.current
    if (el?.complete && el.naturalWidth === 0) next()
  }, [step])

  return {
    ref,
    src: sources[step],
    exhausted: step >= sources.length,
    next,
    onLoad,
  }
}

export function PlayerAvatar({
  playerId,
  name,
  size = 44,
  ring,
}: {
  playerId: number | string
  name: string
  size?: number
  ring?: string
}) {
  const { ref, src, exhausted, next } = useFallbackChain([
    playerImage(playerId),
    playerImageFallback(playerId),
  ])

  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full overflow-hidden bg-secondary/60 text-muted-foreground font-medium select-none"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.34),
        boxShadow: ring ? `0 0 0 2px ${ring}` : undefined,
      }}
    >
      {exhausted ? (
        initials(name)
      ) : (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          key={src}
          ref={ref}
          src={src}
          alt={name}
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={next}
          className="w-full h-full object-cover"
        />
      )}
    </span>
  )
}

export function LeagueCrest({
  tournamentId,
  name,
  size = 20,
  className = "",
  variant = "circle",
  priority = false,
}: {
  tournamentId: number | string
  name: string
  size?: number
  className?: string
  variant?: "tile" | "transparent" | "circle"
  priority?: boolean
}) {
  const sources = useMemo(
    () => [leagueImage(tournamentId), leagueImageFallback(tournamentId)],
    [tournamentId],
  )
  const { ref, src, exhausted, next, onLoad } = useFallbackChain(
    sources,
    `league-${tournamentId}`,
  )
  if (exhausted) return null

  if (variant === "transparent") {
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img
        key={src}
        ref={ref}
        src={src}
        alt={name}
        title={name}
        width={size}
        height={size}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        referrerPolicy="no-referrer"
        onLoad={onLoad}
        onError={next}
        className={`inline-block shrink-0 object-contain ${className}`}
        style={{ width: size, height: size }}
      />
    )
  }

  // Circular white badge container for high contrast and readability on dark themes
  const isCircle = variant === "circle" || variant === "tile"
  const inner = Math.round(size * 0.72)
  return (
    <span
      className={`shrink-0 ${
        isCircle ? "rounded-full" : "rounded-md"
      } bg-white shadow-xs overflow-hidden inline-flex items-center justify-center border border-black/10 select-none ${className}`}
      style={{
        width: size,
        height: size,
      }}
      title={name}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={src}
        ref={ref}
        src={src}
        alt={name}
        width={inner}
        height={inner}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        referrerPolicy="no-referrer"
        onLoad={onLoad}
        onError={next}
        className="object-contain"
        style={{ width: inner, height: inner }}
      />
    </span>
  )
}

export function TeamCrest({
  teamId,
  name,
  size = 18,
  className = "",
  priority = false,
}: {
  teamId: number | string
  name: string
  size?: number
  className?: string
  priority?: boolean
}) {
  const isNational = TOP_10_FIFA_NATION_IDS.has(Number(teamId))
  const sources = useMemo(
    () =>
      isNational
        ? [teamImageFallback(teamId), teamImage(teamId)]
        : [teamImage(teamId), teamImageFallback(teamId)],
    [teamId, isNational],
  )
  const { ref, src, exhausted, next, onLoad } = useFallbackChain(
    sources,
    `team-${teamId}`,
  )
  if (exhausted) return null

  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      key={src}
      ref={ref}
      src={src}
      alt={name}
      title={name}
      width={size}
      height={size}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      referrerPolicy="no-referrer"
      onLoad={onLoad}
      onError={next}
      className={`inline-block shrink-0 object-contain ${className}`}
      style={{ width: size, height: size }}
    />
  )
}
