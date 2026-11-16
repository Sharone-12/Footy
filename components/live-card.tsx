"use client"

import { useEffect, useState, type ReactNode } from "react"
import Link from "next/link"
import { PlayIcon } from "lucide-react"
import { TeamCrest, LeagueCrest } from "@/components/player-avatar"
import { Flip } from "@/components/flip"
import { useLiveNow, useLiveScore } from "@/components/live-score"
import { matchClock } from "@/lib/livescores"
import { getLeagueTournamentId } from "@/lib/teams"
import { clubColor } from "@/lib/club-colors"
import type { LiveFixture } from "@/components/live-sections"

type Side = { possession: number; totalShots: number; xg: number }
type Stats = { hasStats: boolean; home: Side; away: Side }

/** Once a minute is plenty for a possession bar, and it is one request a card. */
const STATS_EVERY_MS = 60_000
const R = 26
const CIRCUMFERENCE = 2 * Math.PI * R

/**
 * A match in play, given room: the score in scoreboard digits, a ring that
 * fills as the ninety minutes run down, and who has had the ball.
 */
export function LiveCard({
  m,
  watchable,
  pills,
}: {
  m: LiveFixture
  watchable: boolean
  pills?: ReactNode
}) {
  const score = useLiveScore(m)
  const now = useLiveNow()
  const clock = score ? matchClock(score, now) : null
  const [stats, setStats] = useState<Stats | null>(null)

  // Keyed on the feed's own event id, which the score already carries: the
  // server then skips a fixture lookup, and the URL is the same one the watch
  // page polls, so the CDN serves both from one entry. No score, no stats.
  const eid = score?.id ?? null
  useEffect(() => {
    if (!eid) return
    let alive = true
    const load = () =>
      fetch(`/api/livescores/stats?eid=${encodeURIComponent(eid)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((s: Stats | null) => alive && s?.hasStats && setStats(s))
        .catch(() => {})
    load()
    const t = setInterval(load, STATS_EVERY_MS)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [eid])

  const tid = getLeagueTournamentId(m.league)
  const homeTone = clubColor(m.home) ?? "var(--pitch)"
  const awayTone = clubColor(m.away) ?? "oklch(0.75 0 0)"
  const played = Math.min(1, (clock?.minute ?? 0) / 90)
  const poss = stats && stats.home.possession + stats.away.possession > 0 ? stats : null

  return (
    <article className="live-card surface bg-card rounded-2xl p-4 sm:p-5 flex flex-col gap-4">
      <header className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 min-w-0">
          {tid && <LeagueCrest tournamentId={tid} name={m.league} size={18} />}
          <span className="stat-label truncate">{m.league}</span>
        </span>
        <span className="stat-label flex items-center gap-1.5" style={{ color: "var(--pitch)" }}>
          <span className="size-1.5 rounded-full bg-[var(--pitch)] animate-pulse" />
          Live
        </span>
      </header>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="flex flex-col items-center gap-2 min-w-0 text-center">
          {m.home_id != null && <TeamCrest teamId={m.home_id} name={m.home} size={48} />}
          <span className="text-sm font-semibold leading-tight line-clamp-2">{m.home}</span>
        </div>

        <div className="flex flex-col items-center gap-2">
          <span
            className="stat-figure text-4xl sm:text-5xl flex items-center gap-2"
            style={{ fontFamily: "var(--font-condensed)" }}
          >
            {score?.homeGoals == null ? "–" : <Flip value={score.homeGoals} />}
            <span className="text-muted-foreground/60 text-2xl">:</span>
            {score?.awayGoals == null ? "–" : <Flip value={score.awayGoals} />}
          </span>
          {/* The minute, inside a ring that closes at full time. */}
          <span className="relative size-[60px] flex items-center justify-center">
            <svg viewBox="0 0 60 60" className="absolute inset-0 -rotate-90" aria-hidden>
              <circle cx="30" cy="30" r={R} fill="none" stroke="var(--border)" strokeWidth="3" />
              <circle
                cx="30"
                cy="30"
                r={R}
                fill="none"
                stroke="var(--pitch)"
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={CIRCUMFERENCE}
                strokeDashoffset={CIRCUMFERENCE * (1 - played)}
                className="transition-[stroke-dashoffset] duration-1000"
              />
            </svg>
            <span className="stat-figure text-sm tabular-nums" style={{ color: "var(--pitch)" }}>
              {clock?.display ?? "LIVE"}
            </span>
          </span>
        </div>

        <div className="flex flex-col items-center gap-2 min-w-0 text-center">
          {m.away_id != null && <TeamCrest teamId={m.away_id} name={m.away} size={48} />}
          <span className="text-sm font-semibold leading-tight line-clamp-2">{m.away}</span>
        </div>
      </div>

      {poss && (
        <div>
          <div className="flex h-[6px] rounded-full overflow-hidden gap-px">
            <span
              className="transition-[flex-grow] duration-700"
              style={{ flexGrow: poss.home.possession, background: homeTone }}
            />
            <span
              className="transition-[flex-grow] duration-700"
              style={{ flexGrow: poss.away.possession, background: awayTone, opacity: 0.55 }}
            />
          </div>
          <div className="flex justify-between stat-label mt-1.5 tabular-nums">
            <span>{poss.home.possession}% · {poss.home.totalShots} shots</span>
            <span>possession</span>
            <span>{poss.away.totalShots} shots · {poss.away.possession}%</span>
          </div>
        </div>
      )}

      {watchable && (
        <footer className="flex items-center justify-between gap-3 flex-wrap pt-3 border-t border-border/50">
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">{pills}</div>
          <Link
            href={`/live/watch?id=${m.event_id}`}
            aria-label={`Watch ${m.home} vs ${m.away}`}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#16a34a] text-white dark:bg-[var(--pitch)] dark:text-black hover:brightness-110 font-bold text-xs shadow-md transition-all hover:scale-[1.03] shrink-0"
          >
            <PlayIcon className="size-3 fill-current" />
            Watch Now
          </Link>
        </footer>
      )}
    </article>
  )
}
