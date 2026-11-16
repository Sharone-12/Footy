"use client"

import { Flip } from "@/components/flip"
import { useGoalFlash, useLiveNow, useLiveScore } from "@/components/live-score"
import { matchClock, type FixtureLike } from "@/lib/livescores"
import { clubColor } from "@/lib/club-colors"

/** "FC Bayern München" -> "BAY", "1. FC Köln" -> "KÖL": what a broadcast bug shows. */
function abbr(name: string): string {
  const core = name.replace(/^(\d+\.\s*)?((FC|CF|AC|AS|SC|SV|RC|SSC|VfB|VfL|TSG|RB|CA|CD|UD|OGC|LOSC)\s+)+/i, "")
  return (core || name).slice(0, 3).toUpperCase()
}

/**
 * The broadcast score bug, laid over the top-left of a stream.
 *
 * Draws nothing until the match is in the live feed, and nothing at all when
 * scores are hidden. It sits above the player's iframe and lets clicks
 * through, so the stream's own controls still work underneath it.
 */
export function ScoreBug({ fixture, hidden }: { fixture: FixtureLike; hidden?: boolean }) {
  const score = useLiveScore(fixture)
  const now = useLiveNow()
  if (!score || hidden) return null
  const clock = matchClock(score, now)

  return (
    <div className="score-bug absolute top-2.5 left-2.5 sm:top-3.5 sm:left-3.5 z-30 pointer-events-none flex items-stretch rounded-md overflow-hidden text-[0.7rem] sm:text-xs font-bold text-white shadow-[0_4px_18px_rgba(0,0,0,0.6)]">
      <span className="flex items-center gap-1.5 bg-black/80 backdrop-blur-sm pl-0 pr-2 py-1">
        <span className="self-stretch w-1" style={{ background: clubColor(score.home) ?? "#fff" }} />
        <span className="tracking-wide">{abbr(score.home)}</span>
        <span className="stat-figure text-sm tabular-nums px-0.5 flex items-center">
          {score.homeGoals == null ? "–" : <Flip value={score.homeGoals} />}
          <span className="opacity-50 px-0.5">–</span>
          {score.awayGoals == null ? "–" : <Flip value={score.awayGoals} />}
        </span>
        <span className="tracking-wide">{abbr(score.away)}</span>
        <span className="self-stretch w-1 -mr-2 ml-0.5" style={{ background: clubColor(score.away) ?? "#fff" }} />
      </span>
      <span className="flex items-center bg-[var(--pitch)] text-black px-2 tabular-nums">
        {clock.display}
      </span>
    </div>
  )
}

/**
 * A border that pulses in the scoring club's colour over whichever feed just
 * had a goal: with two or four matches on screen, it says which one to look
 * at. An overlay rather than a class on the feed itself, because re-keying
 * the feed would reload its stream.
 */
export function GoalPulse({ fixture }: { fixture: FixtureLike }) {
  const score = useLiveScore(fixture)
  const { flash, side } = useGoalFlash(score)
  if (!flash || !score) return null
  const tone = clubColor(side === "home" ? score.home : score.away) ?? "var(--pitch)"
  return (
    <span
      key={flash}
      aria-hidden
      className="goal-pulse absolute inset-0 z-40 pointer-events-none rounded-[inherit]"
      style={{ "--club": tone } as React.CSSProperties}
    />
  )
}
