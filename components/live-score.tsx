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
      syncTick()
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

  syncTick()

  if (!scoresTimer) {
    void pollScores()
    scoresTimer = setInterval(pollScores, POLL_SCORES_MS)
  }

  if (!streamsTimer) {
    void pollStreams()
    streamsTimer = setInterval(pollStreams, POLL_STREAMS_MS)
  }
}

/**
 * The one-second clock runs only while a match is actually in play.
 *
 * Nothing live means nothing to count up, and an idle timer waking every
 * subscriber on the page once a second is pure cost.
 */
function syncTick() {
  const wanted = listeners.size > 0 && snapshot.scores.length > 0
  if (wanted && !tickTimer) {
    publish({ now: Date.now() })
    tickTimer = setInterval(() => publish({ now: Date.now() }), TICK_MS)
  } else if (!wanted && tickTimer) {
    clearInterval(tickTimer)
    tickTimer = null
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

/**
 * Each hook watches its own slice, not the whole snapshot.
 *
 * Returning the snapshot object meant the one-second tick replaced it and
 * every subscriber on the page re-rendered once a second — scores and stream
 * readers included, which only change when their own poll lands. The slices
 * below keep their identity between polls, so only clock readers tick.
 */
const EMPTY_SCORES: LiveScore[] = []
const EMPTY_IDS: Set<number> = new Set()

const getScores = () => snapshot.scores
const getServerScores = () => EMPTY_SCORES
const getStreamIds = () => snapshot.activeStreamIds
const getServerStreamIds = () => EMPTY_IDS
const getNow = () => snapshot.now
const getServerNow = () => 0

export function useLiveScore(fixture: FixtureLike): LiveScore | null {
  const scores = useSyncExternalStore(subscribe, getScores, getServerScores)
  return findLive(fixture, scores)
}

/** Check if a fixture currently has an active confirmed live stream. */
export function useHasLiveStream(eventId?: number | null): boolean {
  const activeStreamIds = useSyncExternalStore(subscribe, getStreamIds, getServerStreamIds)
  if (!eventId) return false
  return activeStreamIds.has(eventId)
}

/** The shared one-second clock, for callers that already have a score. */
export function useLiveNow(): number {
  return useSyncExternalStore(subscribe, getNow, getServerNow)
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
  // The clock subscription lives in the inner component so that a row with no
  // live match never subscribes to the tick, and never re-renders for it.
  if (!score) return null
  return <LiveMark score={score} className={className} />
}

function LiveMark({ score, className }: { score: LiveScore; className: string }) {
  const now = useLiveNow()
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
