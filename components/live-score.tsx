"use client"

import { useSyncExternalStore } from "react"
import { findLive, matchClock, type FixtureLike, type LiveScore } from "@/lib/livescores"
import { LiveSignal } from "@/components/live-signal"

/**
 * In-play score and minute for a fixture row.
 *
 * One store for the whole page: every mark on screen shares a single poll and
 * a single one-second tick, so a list of thirty fixtures still makes one
 * request per window rather than thirty. Renders nothing when the fixture is
 * not currently in play, which is what lets it be dropped into a row that
 * already lays out fine without it.
 */

/** Matches the route's own window; a goal lands within one of these. */
const POLL_MS = 15_000

/** The clock is extrapolated locally, so it must repaint every second. */
const TICK_MS = 1_000

type Snapshot = { scores: LiveScore[]; now: number }

let snapshot: Snapshot = { scores: [], now: 0 }
const listeners = new Set<() => void>()
let pollTimer: ReturnType<typeof setInterval> | null = null
let tickTimer: ReturnType<typeof setInterval> | null = null

function publish(next: Partial<Snapshot>) {
  // A fresh object each time: useSyncExternalStore compares by reference.
  snapshot = { ...snapshot, ...next }
  for (const listener of listeners) listener()
}

async function poll() {
  try {
    const response = await fetch("/api/livescores")
    if (!response.ok) return // keep the last good snapshot rather than blanking
    const body = (await response.json()) as { scores?: LiveScore[] }
    if (Array.isArray(body.scores)) publish({ scores: body.scores, now: Date.now() })
  } catch {
    // Offline or a blip: the existing snapshot keeps ticking, and the clock's
    // own staleness guard stops it drifting if this lasts.
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (listeners.size === 1) {
    publish({ now: Date.now() })
    void poll()
    pollTimer = setInterval(poll, POLL_MS)
    tickTimer = setInterval(() => publish({ now: Date.now() }), TICK_MS)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      if (pollTimer) clearInterval(pollTimer)
      if (tickTimer) clearInterval(tickTimer)
      pollTimer = tickTimer = null
    }
  }
}

const getSnapshot = () => snapshot
/** The server has no live data, so marks render absent and appear on hydration. */
const getServerSnapshot = (): Snapshot => ({ scores: [], now: 0 })

export function useLiveScore(fixture: FixtureLike): LiveScore | null {
  const { scores } = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  return findLive(fixture, scores)
}

/** The shared one-second clock, for callers that already have a score. */
export function useLiveNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot).now
}

/**
 * Score and minute for a fixture, or nothing at all.
 *
 * `scoreFirst` puts the scoreline before the clock, which reads better at the
 * end of a row than above it.
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
      className={`inline-flex items-center gap-2 shrink-0 ${className}`}
      title={`Live: ${score.home} ${score.homeGoals ?? "-"}-${score.awayGoals ?? "-"} ${score.away}, ${clock.display}`}
    >
      <span className="stat-figure text-base tabular-nums">
        {score.homeGoals ?? "–"}&ndash;{score.awayGoals ?? "–"}
      </span>
      <span className="inline-flex items-center gap-1">
        <LiveSignal size={11} />
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
