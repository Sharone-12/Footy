"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  PlayIcon,
  PauseIcon,
  Volume2Icon,
  VolumeXIcon,
  MaximizeIcon,
  MinimizeIcon,
} from "lucide-react"

/**
 * YouTube stream with our own controls.
 *
 * `controls: 0` hides YouTube's bar (a documented player parameter) and the
 * IFrame API drives playback instead, so the buttons below are ours. Chiefly
 * this gets a real fullscreen button: ours calls requestFullscreen() on the
 * wrapper, taking the whole card full-screen with our controls still on it,
 * rather than depending on YouTube's own chrome.
 */

type YTPlayer = {
  playVideo(): void
  pauseVideo(): void
  mute(): void
  unMute(): void
  isMuted(): boolean
  getDuration(): number
  destroy(): void
}

type YTNamespace = {
  Player: new (
    el: HTMLElement,
    opts: {
      videoId: string
      playerVars?: Record<string, string | number>
      events?: {
        onReady?: (e: { target: YTPlayer }) => void
        onStateChange?: (e: { data: number; target: YTPlayer }) => void
      }
    },
  ) => YTPlayer
  PlayerState: { PLAYING: number }
}

declare global {
  interface Window {
    YT?: YTNamespace
    onYouTubeIframeAPIReady?: () => void
  }
}

/** One script tag and one promise for the whole app, however many players mount. */
let apiPromise: Promise<YTNamespace> | null = null
function loadApi(): Promise<YTNamespace> {
  apiPromise ??= new Promise((resolve) => {
    if (window.YT?.Player) return resolve(window.YT)
    const previous = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      previous?.()
      resolve(window.YT as YTNamespace)
    }
    const script = document.createElement("script")
    script.src = "https://www.youtube.com/iframe_api"
    document.head.appendChild(script)
  })
  return apiPromise
}

export function YouTubePlayer({ id, title }: { id: string; title?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const mountRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<YTPlayer | null>(null)
  const [ready, setReady] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(false)
  const [live, setLive] = useState(false)
  const [full, setFull] = useState(false)

  useEffect(() => {
    let cancelled = false
    // The API replaces the element it is handed with an iframe, so hand it a
    // plain child React never owns — otherwise React tries to remove a node
    // that is no longer in the tree on unmount.
    const slot = document.createElement("div")
    slot.className = "absolute inset-0 h-full w-full"
    mountRef.current?.appendChild(slot)

    loadApi().then((YT) => {
      if (cancelled) return
      playerRef.current = new YT.Player(slot, {
        videoId: id,
        playerVars: { controls: 0, rel: 0, playsinline: 1 },
        events: {
          onReady: (e) => {
            setReady(true)
            setMuted(e.target.isMuted())
            // A live stream reports no duration; there is nothing to seek.
            setLive(e.target.getDuration() === 0)
          },
          onStateChange: (e) => setPlaying(e.data === YT.PlayerState.PLAYING),
        },
      })
    })

    return () => {
      cancelled = true
      playerRef.current?.destroy()
      playerRef.current = null
      slot.remove()
    }
  }, [id])

  useEffect(() => {
    const onChange = () => setFull(document.fullscreenElement === wrapRef.current)
    document.addEventListener("fullscreenchange", onChange)
    return () => document.removeEventListener("fullscreenchange", onChange)
  }, [])

  const togglePlay = useCallback(() => {
    const p = playerRef.current
    if (!p) return
    if (playing) p.pauseVideo()
    else p.playVideo()
  }, [playing])

  const toggleMute = useCallback(() => {
    const p = playerRef.current
    if (!p) return
    if (p.isMuted()) p.unMute()
    else p.mute()
    setMuted(p.isMuted())
  }, [])

  const toggleFull = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen()
    else wrapRef.current?.requestFullscreen()
  }, [])

  return (
    <div
      ref={wrapRef}
      className="player surface bg-card rounded-2xl overflow-hidden relative group/player"
    >
      <div
        ref={mountRef}
        className="player-frame relative aspect-video bg-black"
        aria-label={title}
      />
      <div
        className={`absolute inset-x-0 bottom-0 flex items-center gap-2 px-3 py-2.5 bg-gradient-to-t from-black/80 to-transparent transition-opacity duration-200 ${
          playing
            ? "opacity-0 group-hover/player:opacity-100 focus-within:opacity-100"
            : "opacity-100"
        }`}
      >
        <Ctl onClick={togglePlay} disabled={!ready} label={playing ? "Pause" : "Play"}>
          {playing ? <PauseIcon className="size-4" /> : <PlayIcon className="size-4" />}
        </Ctl>
        <Ctl onClick={toggleMute} disabled={!ready} label={muted ? "Unmute" : "Mute"}>
          {muted ? <VolumeXIcon className="size-4" /> : <Volume2Icon className="size-4" />}
        </Ctl>
        {live && (
          <span className="stat-label text-[0.6rem] flex items-center gap-1.5 ml-1">
            <span className="size-1.5 rounded-full bg-red-500 animate-pulse" />
            LIVE
          </span>
        )}
        <span className="flex-1" />
        <Ctl onClick={toggleFull} label={full ? "Exit full screen" : "Full screen"}>
          {full ? <MinimizeIcon className="size-4" /> : <MaximizeIcon className="size-4" />}
        </Ctl>
      </div>
    </div>
  )
}

function Ctl({
  onClick,
  label,
  disabled,
  children,
}: {
  onClick: () => void
  label: string
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="inline-flex items-center justify-center size-8 rounded-full text-white/90 hover:text-white hover:bg-white/15 disabled:opacity-40 transition-colors"
    >
      {children}
    </button>
  )
}
