"use client"

import { useSyncExternalStore } from "react"
import { findLive, matchClock, type FixtureLike, type LiveScore } from "@/lib/livescores"
import { LiveSignal } from "@/components/live-signal"

/**
 * In-play score, match clock, and live stream telemetry for fixture rows.
 *
 * One shared store for the whole page:
 * - Scores poll every 15 seconds independently (resolves in ~50ms).
 * - Stream discovery polls every 30 seconds independently (cached, non-blocking).
 * - A 1-second local tick extrapolates the running match clock smoothly.
 * - Teardown is debounced so page transitions keep cached data and stay hot without flickering.
 */

const POLL_SCORES_MS = 15_000
const POLL_STREAMS_MS = 30_000
const TICK_MS = 1_000
const TEARDOWN_DELAY_MS = 10_000

type Snapshot = {
  scores: LiveScore[]
  activeStreamIds: Set<number>
  now: number
  hasLoadedScores: boolean
  hasLoadedStreams: boolean
}

let snapshot: Snapshot = {
  scores: [],
  activeStreamIds: new Set(),
  now: Date.now(),
  hasLoadedScores: false,
  hasLoadedStreams: false,
}

const listeners = new Set<() => void>()
let scoresTimer: ReturnType<typeof setInterval> | null = null
let streamsTimer: ReturnType<typeof setInterval> | null = null
let tickTimer: ReturnType<typeof setInterval> | null = null
let teardownTimer: ReturnType<typeof setTimeout> | null = null

function publish(next: Partial<Snapshot>) {
  snapshot = { ...snapshot, ...next }
  for (const listener of listeners) listener()
}

async function pollScores() {
  try {
    const res = await fetch("/api/livescores")
    if (!res.ok) return
    const body = (await res.json()) as { scores?: LiveScore[] }
    if (Array.isArray(body.scores)) {
      publish({ scores: body.scores, now: Date.now(), hasLoadedScores: true })
    }
  } catch {
    // Offline or network blip: preserve existing snapshot
  }
}

async function pollStreams() {
  try {
    const res = await fetch("/api/streams/active")
    if (!res.ok) return
    const body = (await res.json()) as { eventIds?: number[] }
    if (Array.isArray(body.eventIds)) {
      publish({
        activeStreamIds: new Set(body.eventIds),
        now: Date.now(),
        hasLoadedStreams: true,
      })
    }
  } catch {
    // Offline or network blip: preserve existing active streams
  }
}

function startPolling() {
  if (teardownTimer) {
    clearTimeout(teardownTimer)
    teardownTimer = null
  }

  if (!tickTimer) {
    publish({ now: Date.now() })
    tickTimer = setInterval(() => publish({ now: Date.now() }), TICK_MS)
  }

  if (!scoresTimer) {
    void pollScores()
    scoresTimer = setInterval(pollScores, POLL_SCORES_MS)
  }

  if (!streamsTimer) {
    void pollStreams()
    streamsTimer = setInterval(pollStreams, POLL_STREAMS_MS)
  }
}

function stopPollingWithDelay() {
  if (teardownTimer) clearTimeout(teardownTimer)
  teardownTimer = setTimeout(() => {
    if (listeners.size === 0) {
      if (scoresTimer) clearInterval(scoresTimer)
      if (streamsTimer) clearInterval(streamsTimer)
      if (tickTimer) clearInterval(tickTimer)
      scoresTimer = streamsTimer = tickTimer = null
    }
    teardownTimer = null
  }, TEARDOWN_DELAY_MS)
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (listeners.size === 1) {
    startPolling()
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      stopPollingWithDelay()
    }
  }
}

const getSnapshot = () => snapshot
const getServerSnapshot = (): Snapshot => ({
  scores: [],
  activeStreamIds: new Set(),
  now: 0,
  hasLoadedScores: false,
  hasLoadedStreams: false,
})

export function useLiveScore(fixture: FixtureLike): LiveScore | null {
  const { scores } = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  return findLive(fixture, scores)
}

/** Check if a fixture currently has an active confirmed live stream. */
export function useHasLiveStream(eventId?: number | null): boolean {
  const { activeStreamIds } = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  if (!eventId) return false
  return activeStreamIds.has(eventId)
}

/** The shared one-second clock, for callers that already have a score. */
export function useLiveNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot).now
}

/**
 * Score and minute for a fixture, or nothing at all.
 */
export function LiveFixtureMark({
  fixture,
  className = "",
}: {
  fixture: FixtureLike
  className?: string
}) {
  const score = useLiveScore(fixture)
  const now = useLiveNow()
  if (!score) return null

  const clock = matchClock(score, now)
  return (
    <span
      className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-xl bg-black/40 border border-white/10 shrink-0 shadow-sm ${className}`}
      title={`Live: ${score.home} ${score.homeGoals ?? "-"}-${score.awayGoals ?? "-"} ${score.away}, ${clock.display}`}
    >
      <span className="font-mono font-bold text-xs sm:text-sm tabular-nums text-foreground">
        {score.homeGoals ?? "–"}&ndash;{score.awayGoals ?? "–"}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <LiveSignal size={8} />
        <span
          className="font-mono font-bold text-[0.7rem] tabular-nums"
          style={{ color: "var(--pitch)" }}
        >
          {clock.display}
        </span>
      </span>
    </span>
  )
}
