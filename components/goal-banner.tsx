"use client"

import { useEffect, useState } from "react"
import { Flip } from "@/components/flip"
import { clubColor } from "@/lib/club-colors"

export const GOAL_EVENT = "footyy:goal"

export type GoalDetail = {
  home: string
  away: string
  homeGoals: number
  awayGoals: number
  /** Which side just scored. */
  side: "home" | "away"
  clock?: string
}

const HOLD_MS = 6000

/**
 * A broadcast-style lower third when a goal goes in, on whatever page you
 * are on.
 *
 * Fed by a window event rather than props: several score pills for the same
 * match can be on screen at once and each notices the goal, so the banner
 * de-duplicates on the scoreline instead of every pill owning its own.
 */
export function GoalBanner() {
  const [goal, setGoal] = useState<(GoalDetail & { key: string }) | null>(null)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const onGoal = (e: Event) => {
      const d = (e as CustomEvent<GoalDetail>).detail
      const key = `${d.home}|${d.away}|${d.homeGoals}-${d.awayGoals}`
      setGoal((now) => (now?.key === key ? now : { ...d, key }))
      clearTimeout(timer)
      timer = setTimeout(() => setGoal(null), HOLD_MS)
    }
    window.addEventListener(GOAL_EVENT, onGoal)
    return () => {
      window.removeEventListener(GOAL_EVENT, onGoal)
      clearTimeout(timer)
    }
  }, [])

  if (!goal) return null
  const scorer = goal.side === "home" ? goal.home : goal.away
  const tone = clubColor(scorer) ?? "var(--pitch)"

  return (
    <div
      key={goal.key}
      role="status"
      className="goal-banner fixed left-3 sm:left-6 bottom-5 sm:bottom-8 z-[9998] pointer-events-none flex items-stretch max-w-[calc(100vw-1.5rem)]"
      style={{ "--club": tone } as React.CSSProperties}
    >
      <span
        className="goal-banner-tag flex items-center px-3 sm:px-4 text-2xl sm:text-3xl font-bold tracking-tight text-black"
        style={{ fontFamily: "var(--font-condensed)", background: "var(--club)" }}
      >
        GOAL
      </span>
      <span className="goal-banner-body flex flex-col justify-center gap-0.5 bg-black/85 backdrop-blur px-3 sm:px-4 py-2 border-y border-r border-white/10 min-w-0">
        <span
          className="text-base sm:text-lg font-bold uppercase leading-none truncate"
          style={{ fontFamily: "var(--font-condensed)", color: "var(--club)" }}
        >
          {scorer}
        </span>
        <span className="flex items-center gap-2 text-xs sm:text-sm text-white/85 leading-none whitespace-nowrap">
          <span className="truncate">{goal.home}</span>
          <span className="stat-figure text-white">
            <Flip value={goal.homeGoals} />
            –
            <Flip value={goal.awayGoals} />
          </span>
          <span className="truncate">{goal.away}</span>
          {goal.clock && <span className="text-white/50">{goal.clock}</span>}
        </span>
      </span>
    </div>
  )
}
