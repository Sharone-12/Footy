"use client"

import { useState } from "react"
import { TeamCrest } from "@/components/player-avatar"
import { TEAM_STAT_GROUPS, statValue, type SeasonStatRow, type TeamStat } from "@/lib/teams"

const TEAM_COLORS = ["#4ade80", "#60a5fa"]

export type MatchStatItem = {
  home: string
  away: string
}

export interface PredictionStatCompareProps {
  home: string
  away: string
  homeId: number | null
  awayId: number | null
  byKey: Record<string, SeasonStatRow>
  matchStats?: Record<string, MatchStatItem>
  isSettled?: boolean
}

/**
 * Parses raw strings from match_stats (e.g. "2.21", "19", "61%", "29/51 (57%)", "107.9 km").
 * Returns a numeric representation for proportional bars and the display string.
 */
function parseSingleMatchStat(val: string | undefined, pct?: boolean): { num: number; display: string } {
  if (!val) return { num: 0, display: "–" }
  const trimmed = val.trim()

  // Percentage e.g. "61%"
  if (trimmed.endsWith("%")) {
    const n = parseFloat(trimmed)
    return { num: Number.isNaN(n) ? 0 : n, display: trimmed }
  }

  // Fraction with percentage e.g. "29/51 (57%)"
  const fractionMatch = trimmed.match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)\s*\((?:(\d+(?:\.\d+)?)%)\)$/)
  if (fractionMatch) {
    if (pct) {
      const p = parseFloat(fractionMatch[3])
      return { num: Number.isNaN(p) ? 0 : p, display: `${fractionMatch[3]}%` }
    }
    const n = parseFloat(fractionMatch[1])
    return { num: Number.isNaN(n) ? 0 : n, display: trimmed }
  }

  // Float or integer with unit e.g. "107.9 km"
  const numMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)/)
  if (numMatch) {
    const n = parseFloat(numMatch[1])
    return { num: Number.isNaN(n) ? 0 : n, display: trimmed }
  }

  return { num: 0, display: trimmed }
}

export function PredictionStatCompare({
  home,
  away,
  homeId,
  awayId,
  byKey,
  matchStats = {},
  isSettled = false,
}: PredictionStatCompareProps) {
  const hasMatchStats = Object.keys(matchStats).length > 0
  const [mode, setMode] = useState<"match" | "season">(
    isSettled && hasMatchStats ? "match" : "season",
  )

  return (
    <section className="surface rounded-2xl bg-card overflow-hidden">
      <header className="px-5 pt-5 pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2
              className="text-lg font-semibold tracking-tight uppercase"
              style={{ fontFamily: "var(--font-condensed)" }}
            >
              Stat Comparison
            </h2>
            <p className="stat-label mt-1 text-xs text-muted-foreground">
              {mode === "match"
                ? "Actual 90-minute match statistics"
                : "Per-match season averages (used for prediction)"}
            </p>
          </div>

          {/* Mode toggle */}
          {hasMatchStats && (
            <div
              role="tablist"
              aria-label="Stat comparison view mode"
              className="inline-flex items-center p-1 rounded-xl bg-muted/60 border border-border/50 self-start sm:self-auto"
            >
              <button
                type="button"
                role="tab"
                aria-selected={mode === "match"}
                onClick={() => setMode("match")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  mode === "match"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Match Stats
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "season"}
                onClick={() => setMode("season")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  mode === "season"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Season Averages
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between mt-4 px-2">
          <div className="flex items-center gap-2">
            {homeId && <TeamCrest teamId={homeId} name={home} size={20} />}
            <span className="text-sm font-medium" style={{ color: TEAM_COLORS[0] }}>
              {home}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium" style={{ color: TEAM_COLORS[1] }}>
              {away}
            </span>
            {awayId && <TeamCrest teamId={awayId} name={away} size={20} />}
          </div>
        </div>
      </header>

      <div className="px-3 pb-4">
        {TEAM_STAT_GROUPS.map((group) => {
          const visibleStats = group.stats.filter((spec) => {
            if (mode === "match") {
              return matchStats[spec.stat] != null
            }
            return (
              byKey[`${home}|${spec.stat}`] != null || byKey[`${away}|${spec.stat}`] != null
            )
          })

          if (visibleStats.length === 0) return null

          return (
            <div key={group.label} className="mb-4 last:mb-0">
              <div className="stat-label px-2 py-2" style={{ color: "var(--pitch)" }}>
                {group.label}
              </div>
              {visibleStats.map((spec) => {
                let hv = 0
                let av = 0
                let hDisplay = "–"
                let aDisplay = "–"

                if (mode === "match") {
                  const item = matchStats[spec.stat]
                  const ph = parseSingleMatchStat(item?.home, spec.pct)
                  const pa = parseSingleMatchStat(item?.away, spec.pct)
                  hv = ph.num
                  av = pa.num
                  hDisplay = ph.display
                  aDisplay = pa.display
                } else {
                  hv = statValue(byKey[`${home}|${spec.stat}`], spec)
                  av = statValue(byKey[`${away}|${spec.stat}`], spec)
                  hDisplay = `${hv.toFixed(spec.pct ? 1 : 2)}${spec.pct ? "%" : ""}`
                  aDisplay = `${av.toFixed(spec.pct ? 1 : 2)}${spec.pct ? "%" : ""}`
                }

                const max = Math.max(Math.abs(hv), Math.abs(av), 0.01)
                const hBetter = hv > av
                const aBetter = av > hv

                return (
                  <div
                    key={spec.stat}
                    className="px-2 py-2.5 border-b border-border/40 last:border-0"
                  >
                    <div className="text-center stat-label mb-2">{spec.label}</div>
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                      {/* Home team */}
                      <div className="flex items-center gap-2 justify-end">
                        <span
                          className="stat-figure text-[0.95rem] tabular-nums"
                          style={{ color: hBetter ? TEAM_COLORS[0] : "var(--muted-foreground)" }}
                        >
                          {hDisplay}
                        </span>
                        <div className="w-20 sm:w-24 h-2 rounded-full bg-muted/60 overflow-hidden flex justify-end">
                          <div
                            className="h-full rounded-full transition-all duration-300"
                            style={{
                              width: `${Math.min(100, Math.max(4, (Math.abs(hv) / max) * 100))}%`,
                              background: TEAM_COLORS[0],
                              opacity: hBetter ? 0.9 : 0.35,
                            }}
                          />
                        </div>
                      </div>

                      <span className="text-muted-foreground text-xs">vs</span>

                      {/* Away team */}
                      <div className="flex items-center gap-2">
                        <div className="w-20 sm:w-24 h-2 rounded-full bg-muted/60 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-300"
                            style={{
                              width: `${Math.min(100, Math.max(4, (Math.abs(av) / max) * 100))}%`,
                              background: TEAM_COLORS[1],
                              opacity: aBetter ? 0.9 : 0.35,
                            }}
                          />
                        </div>
                        <span
                          className="stat-figure text-[0.95rem] tabular-nums"
                          style={{ color: aBetter ? TEAM_COLORS[1] : "var(--muted-foreground)" }}
                        >
                          {aDisplay}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </section>
  )
}
