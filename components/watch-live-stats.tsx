"use client"

import { useState, useEffect, useRef } from "react"
import { BarChart2Icon, ActivityIcon, RefreshCwIcon } from "lucide-react"
import { TeamCrest } from "@/components/player-avatar"
import type { LiveFixture } from "@/components/live-sections"
import { useLiveNow } from "@/components/live-score"
import { matchClock, type LiveScore } from "@/lib/livescores"
import type { LiveMatchStatsResponse } from "@/app/api/livescores/stats/route"

export type WatchLiveStatsProps = {
  fixture: LiveFixture
  liveScore?: LiveScore | null
}

function StatRow({
  label,
  homeVal,
  awayVal,
  formatVal = (v) => String(v),
  isPercentage = false,
  inverseHighlight = false,
}: {
  label: string
  homeVal: number
  awayVal: number
  formatVal?: (v: number) => string
  isPercentage?: boolean
  inverseHighlight?: boolean
}) {
  const total = homeVal + awayVal
  let homePct = 50
  let awayPct = 50

  if (isPercentage) {
    homePct = Math.min(100, Math.max(0, homeVal))
    awayPct = Math.min(100, Math.max(0, awayVal))
  } else if (total > 0) {
    homePct = Math.round((homeVal / total) * 100)
    awayPct = Math.round((awayVal / total) * 100)
  }

  const isHomeLeading = inverseHighlight ? homeVal < awayVal : homeVal > awayVal
  const isAwayLeading = inverseHighlight ? awayVal < homeVal : awayVal > homeVal
  const isEqual = homeVal === awayVal

  return (
    <div className="flex flex-col gap-1.5 py-1.5 sm:py-2 border-b border-white/[0.04] last:border-b-0">
      <div className="flex items-center justify-between text-xs sm:text-sm">
        <span
          className={`font-mono font-bold tabular-nums min-w-[36px] text-left ${
            isHomeLeading ? "text-white font-black" : "text-white/60"
          }`}
        >
          {formatVal(homeVal)}
        </span>
        <span className="text-[11px] sm:text-xs font-semibold text-white/50 text-center tracking-tight truncate px-2 select-none">
          {label}
        </span>
        <span
          className={`font-mono font-bold tabular-nums min-w-[36px] text-right ${
            isAwayLeading ? "text-white font-black" : "text-white/60"
          }`}
        >
          {formatVal(awayVal)}
        </span>
      </div>

      {/* Dual Comparative Visual Progress Bars */}
      <div className="grid grid-cols-2 gap-1 sm:gap-2 h-1.5 sm:h-2">
        {/* Left Team Bar (fills from left or right) */}
        <div className="h-full bg-white/10 rounded-full overflow-hidden flex justify-end">
          <div
            className={`h-full rounded-full transition-all duration-500 motion-reduce:transition-none ${
              isHomeLeading
                ? "bg-[var(--pitch)] shadow-[0_0_8px_rgba(34,197,94,0.4)]"
                : isEqual && total > 0
                ? "bg-[var(--pitch)]/60"
                : "bg-white/20"
            }`}
            style={{ width: `${total === 0 ? 0 : homePct}%` }}
          />
        </div>

        {/* Right Team Bar */}
        <div className="h-full bg-white/10 rounded-full overflow-hidden flex justify-start">
          <div
            className={`h-full rounded-full transition-all duration-500 motion-reduce:transition-none ${
              isAwayLeading
                ? "bg-[var(--pitch)] shadow-[0_0_8px_rgba(34,197,94,0.4)]"
                : isEqual && total > 0
                ? "bg-[var(--pitch)]/60"
                : "bg-white/20"
            }`}
            style={{ width: `${total === 0 ? 0 : awayPct}%` }}
          />
        </div>
      </div>
    </div>
  )
}

export function WatchLiveStatsCard({ fixture, liveScore }: WatchLiveStatsProps) {
  const [stats, setStats] = useState<LiveMatchStatsResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const liveNow = useLiveNow()
  const liveClock = liveScore ? matchClock(liveScore, liveNow) : null

  const eid = liveScore?.id || null
  const fixtureId = fixture?.event_id || null

  const fetchStats = async (isManual = false) => {
    if (!eid && !fixtureId) {
      setIsLoading(false)
      return
    }

    if (isManual) setIsRefreshing(true)

    try {
      const param = eid ? `eid=${encodeURIComponent(eid)}` : `fixture_id=${encodeURIComponent(fixtureId!)}`
      const res = await fetch(`/api/livescores/stats?${param}`)
      if (res.ok) {
        const data = (await res.json()) as LiveMatchStatsResponse
        if (data && data.hasStats) {
          setStats(data)
        }
      }
    } catch {
      // Retain existing stats on network blip
    } finally {
      setIsLoading(false)
      if (isManual) setIsRefreshing(false)
    }
  }

  useEffect(() => {
    fetchStats()

    // Poll every 15 seconds during live match
    pollTimerRef.current = setInterval(() => {
      fetchStats()
    }, 15_000)

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
    }
  }, [eid, fixtureId])

  // If no stats yet and not loading, or stats don't exist yet (pre-match)
  if (!isLoading && (!stats || !stats.hasStats)) {
    return null
  }

  const home = stats?.home
  const away = stats?.away

  return (
    <section
      aria-label="Live Match Detailed Stats"
      className="surface rounded-2xl bg-card p-3.5 sm:p-4 md:p-5 border border-border/70 shadow-sm transition-all animate-fade-in"
    >
      {/* Big Team Crests directly over their side & numbers */}
      <div className="grid grid-cols-3 items-center pt-2 pb-5 px-3 mb-3 border-b border-white/10 select-none">
        {/* Home Team & Crest directly over left numbers */}
        <div className="flex flex-col items-start sm:items-center text-left sm:text-center gap-2 min-w-0">
          {fixture.home_id ? (
            <TeamCrest
              teamId={fixture.home_id}
              name={fixture.home}
              size={56}
              className="drop-shadow-lg"
            />
          ) : (
            <div className="size-14 rounded-full bg-white/10 flex items-center justify-center font-bold text-base text-white/70">
              {fixture.home.slice(0, 2)}
            </div>
          )}
          <span className="font-bold text-xs sm:text-sm text-white max-w-[130px] sm:max-w-[180px] truncate leading-tight">
            {fixture.home}
          </span>
        </div>

        {/* Center: Live Scoreline & Time */}
        <div className="flex flex-col items-center justify-center text-center">
          <div className="font-mono font-black text-2xl sm:text-3xl tracking-wider text-white tabular-nums drop-shadow-md">
            <span>{liveScore?.homeGoals ?? 0}</span>
            <span className="text-white/30 mx-2">-</span>
            <span>{liveScore?.awayGoals ?? 0}</span>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold font-mono text-[var(--pitch)] bg-[var(--pitch)]/10 border border-[var(--pitch)]/25 animate-pulse">
              {liveClock?.display || liveScore?.status || "LIVE"}
            </span>
            <button
              type="button"
              onClick={() => fetchStats(true)}
              disabled={isRefreshing}
              className="p-1 rounded-md text-white/40 hover:text-white transition-colors hover:bg-white/10 focus:outline-none"
              title="Refresh live stats"
              aria-label="Refresh live stats"
            >
              <RefreshCwIcon className={`size-3 ${isRefreshing ? "animate-spin text-[var(--pitch)]" : ""}`} />
            </button>
          </div>
        </div>

        {/* Away Team & Crest directly over right numbers */}
        <div className="flex flex-col items-end sm:items-center text-right sm:text-center gap-2 min-w-0">
          {fixture.away_id ? (
            <TeamCrest
              teamId={fixture.away_id}
              name={fixture.away}
              size={56}
              className="drop-shadow-lg"
            />
          ) : (
            <div className="size-14 rounded-full bg-white/10 flex items-center justify-center font-bold text-base text-white/70">
              {fixture.away.slice(0, 2)}
            </div>
          )}
          <span className="font-bold text-xs sm:text-sm text-white max-w-[130px] sm:max-w-[180px] truncate leading-tight">
            {fixture.away}
          </span>
        </div>
      </div>

      {/* Stats Breakdown Rows */}
      {home && away ? (
        <div className="flex flex-col">
          {/* 1. Expected goals (xG) */}
          <StatRow
            label="Expected goals (xG)"
            homeVal={home.xg}
            awayVal={away.xg}
            formatVal={(v) => v.toFixed(2)}
          />

          {/* 2. Possession (%) */}
          <StatRow
            label="Possession (%)"
            homeVal={home.possession}
            awayVal={away.possession}
            formatVal={(v) => `${v}%`}
            isPercentage
          />

          {/* 3. Total Shots */}
          <StatRow
            label="Total Shots"
            homeVal={home.totalShots}
            awayVal={away.totalShots}
          />

          {/* 4. Shots on target */}
          <StatRow
            label="Shots on target"
            homeVal={home.shotsOnTarget}
            awayVal={away.shotsOnTarget}
          />

          {/* 5. Shots off target */}
          <StatRow
            label="Shots off target"
            homeVal={home.shotsOffTarget}
            awayVal={away.shotsOffTarget}
          />

          {/* 6. Blocked Shots */}
          <StatRow
            label="Blocked Shots"
            homeVal={home.blockedShots}
            awayVal={away.blockedShots}
          />

          {/* 7. Corner Kicks */}
          <StatRow
            label="Corner Kicks"
            homeVal={home.cornerKicks}
            awayVal={away.cornerKicks}
          />

          {/* 8. Offsides */}
          <StatRow
            label="Offsides"
            homeVal={home.offsides}
            awayVal={away.offsides}
          />

          {/* 9. Fouls */}
          <StatRow
            label="Fouls"
            homeVal={home.fouls}
            awayVal={away.fouls}
            inverseHighlight
          />

          {/* 10. Throw ins */}
          <StatRow
            label="Throw ins"
            homeVal={home.throwIns}
            awayVal={away.throwIns}
          />

          {/* 11. Crosses */}
          <StatRow
            label="Crosses"
            homeVal={home.crosses}
            awayVal={away.crosses}
          />

          {/* 12. Goal kicks */}
          <StatRow
            label="Goal kicks"
            homeVal={home.goalKicks}
            awayVal={away.goalKicks}
          />

          {/* 13. Yellow Cards (only if at least 1 card in match) */}
          {(home.yellowCards > 0 || away.yellowCards > 0) && (
            <StatRow
              label="Yellow Cards"
              homeVal={home.yellowCards}
              awayVal={away.yellowCards}
              inverseHighlight
            />
          )}

          {/* 14. Red Cards (only if at least 1 card in match) */}
          {(home.redCards > 0 || away.redCards > 0) && (
            <StatRow
              label="Red Cards"
              homeVal={home.redCards}
              awayVal={away.redCards}
              inverseHighlight
            />
          )}
        </div>
      ) : (
        <div className="py-6 flex items-center justify-center text-xs text-muted-foreground animate-pulse">
          Loading live match statistics...
        </div>
      )}
    </section>
  )
}

