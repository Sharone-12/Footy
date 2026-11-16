"use client"

import { useEffect, useState, useSyncExternalStore } from "react"
import { Flip } from "@/components/flip"
import { GOAL_EVENT, type GoalDetail } from "@/components/goal-banner"
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

/**
 * Both poll windows match their route's CDN s-maxage, so every tab and every
 * user polling in the same window is served one function invocation.
 */
const POLL_SCORES_MS = 15_000
/** Nothing in play means no goal can land; back off and let the CDN absorb it. */
const POLL_IDLE_MS = 60_000
const POLL_STREAMS_MS = 60_000
const TICK_MS = 1_000
const TEARDOWN_DELAY_MS = 10_000

type Snapshot = {
  scores: LiveScore[]
  final: LiveScore[]
  activeStreamIds: Set<number>
  now: number
  hasLoadedScores: boolean
  hasLoadedStreams: boolean
}

let snapshot: Snapshot = {
  scores: [],
  final: [],
  activeStreamIds: new Set(),
  now: Date.now(),
  hasLoadedScores: false,
  hasLoadedStreams: false,
}

const listeners = new Set<() => void>()
let scoresTimer: ReturnType<typeof setTimeout> | null = null
let scoresBusy = false
let streamsTimer: ReturnType<typeof setInterval> | null = null
let tickTimer: ReturnType<typeof setInterval> | null = null
let teardownTimer: ReturnType<typeof setTimeout> | null = null

function publish(next: Partial<Snapshot>) {
  snapshot = { ...snapshot, ...next }
  for (const listener of listeners) listener()
}

/**
 * The next score poll, chosen after each result rather than fixed at start:
 * a `setInterval` picked at subscribe time saw an empty snapshot and locked
 * in the idle cadence for the whole session, even once matches were on.
 */
function scheduleScores() {
  if (scoresTimer) clearTimeout(scoresTimer)
  scoresTimer = null
  if (listeners.size === 0 || !isDocumentVisible()) return
  const delay = snapshot.scores.length > 0 ? POLL_SCORES_MS : POLL_IDLE_MS
  scoresTimer = setTimeout(() => {
    scoresTimer = null
    void pollScores()
  }, delay)
}

async function pollScores() {
  if (scoresBusy) return
  scoresBusy = true
  try {
    const res = await fetch("/api/livescores")
    if (!res.ok) return
    const body = (await res.json()) as { scores?: LiveScore[]; final?: LiveScore[] }
    if (Array.isArray(body.scores)) {
      publish({
        scores: body.scores,
        final: Array.isArray(body.final) ? body.final : [],
        now: Date.now(),
        hasLoadedScores: true,
      })
      syncTick()
    }
  } catch {
    // Offline or network blip: preserve existing snapshot
  } finally {
    scoresBusy = false
    scheduleScores()
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

function isDocumentVisible(): boolean {
  if (typeof document === "undefined") return true
  return document.visibilityState === "visible"
}

function startPolling() {
  if (teardownTimer) {
    clearTimeout(teardownTimer)
    teardownTimer = null
  }

  syncTick()

  // Only poll if document is currently visible
  if (!isDocumentVisible()) return

  // A poll in flight will schedule the next one itself.
  if (!scoresTimer && !scoresBusy) void pollScores()

  if (!streamsTimer) {
    void pollStreams()
    streamsTimer = setInterval(pollStreams, POLL_STREAMS_MS)
  }
}

function pausePolling() {
  if (scoresTimer) clearTimeout(scoresTimer)
  if (streamsTimer) clearInterval(streamsTimer)
  if (tickTimer) clearInterval(tickTimer)
  scoresTimer = streamsTimer = tickTimer = null
}

// Listen to visibility changes: freeze completely when tab is hidden, resume when focused
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      if (listeners.size > 0) {
        startPolling()
      }
    } else {
      pausePolling()
    }
  })
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
    if (listeners.size === 0) pausePolling()
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
const getFinalScores = () => snapshot.final
const getServerScores = () => EMPTY_SCORES
const getStreamIds = () => snapshot.activeStreamIds
const getServerStreamIds = () => EMPTY_IDS
const getNow = () => snapshot.now
const getServerNow = () => 0

export function useLiveScore(fixture: FixtureLike): LiveScore | null {
  const scores = useSyncExternalStore(subscribe, getScores, getServerScores)
  return findLive(fixture, scores)
}

export function useFinalScore(fixture?: FixtureLike | null): LiveScore | null {
  const finalScores = useSyncExternalStore(subscribe, getFinalScores, getServerScores)
  if (!fixture) return null
  return findLive(fixture, finalScores)
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

/**
 * Counts up each time the watched match's score rises, and says which side
 * scored. Nothing fires on first sight of a match or on switching to another
 * one: only a goal that lands while it is being watched.
 */
export function useGoalFlash(score: LiveScore | null): { flash: number; side: "home" | "away" } {
  const id = score?.id ?? null
  const home = score?.homeGoals ?? 0
  const away = score?.awayGoals ?? 0
  const [seen, setSeen] = useState({ id, home, away })
  const [flash, setFlash] = useState(0)
  const [side, setSide] = useState<"home" | "away">("home")
  if (id !== seen.id) {
    setSeen({ id, home, away })
  } else if (home !== seen.home || away !== seen.away) {
    setSeen({ id, home, away })
    // A score going down is a VAR correction, not something to celebrate.
    if (home + away > seen.home + seen.away) {
      setSide(home > seen.home ? "home" : "away")
      setFlash((f) => f + 1)
    }
  }
  return { flash, side }
}

function LiveMark({ score, className }: { score: LiveScore; className: string }) {
  const now = useLiveNow()
  const clock = matchClock(score, now)
  // A goal since the last poll: remount the pill under a new key so its
  // flash animation runs once. Nothing flashes on first sight of a match.
  const home = score.homeGoals ?? 0
  const away = score.awayGoals ?? 0
  const { flash, side } = useGoalFlash(score)
  // Tell the page-wide banner. Read at the moment of the goal on purpose:
  // the effect is keyed on the flash alone so a clock tick can't re-announce.
  useEffect(() => {
    if (!flash) return
    const detail: GoalDetail = {
      home: score.home,
      away: score.away,
      homeGoals: home,
      awayGoals: away,
      side,
      clock: clock.display,
    }
    window.dispatchEvent(new CustomEvent(GOAL_EVENT, { detail }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flash])
  return (
    <span
      key={flash}
      className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-xl bg-black/40 border border-white/10 shrink-0 shadow-sm ${flash ? "goal-flash" : ""} ${className}`}
      title={`Live: ${score.home} ${score.homeGoals ?? "-"}-${score.awayGoals ?? "-"} ${score.away}, ${clock.display}`}
    >
      <span className="font-mono font-bold text-xs sm:text-sm tabular-nums text-foreground">
        <span className="inline-flex items-center">
          {score.homeGoals == null ? "–" : <Flip value={score.homeGoals} />}
          &ndash;
          {score.awayGoals == null ? "–" : <Flip value={score.awayGoals} />}
        </span>
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
