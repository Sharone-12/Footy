"use client"

import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
  ResponsiveContainer,
} from "recharts"
import { PLAYER_COLORS } from "@/lib/stats"

export function PlayerRadar({
  data,
  players,
  domain,
}: {
  data: Record<string, string | number>[]
  players: string[]
  domain?: [number, number] | "auto"
}) {
  const resolvedDomain: [number, number] = domain === "auto"
    ? [0, Math.ceil(Math.max(...data.flatMap((row) => players.map((p) => Number(row[p]) || 0))) * 1.15) || 1]
    : domain ?? [0, 100]

  return (
    <ResponsiveContainer width="100%" height={320}>
      <RadarChart data={data} cx="50%" cy="50%" outerRadius="68%">
        <PolarGrid stroke="var(--chart-grid, var(--border))" />
        <PolarAngleAxis
          dataKey="stat"
          tick={{ fill: "var(--muted-foreground, oklch(0.65 0 0))", fontSize: 11 }}
        />
        <PolarRadiusAxis
          angle={90}
          stroke="var(--chart-grid, var(--border))"
          domain={resolvedDomain}
          tick={domain === "auto" ? false : { fill: "var(--muted-foreground, oklch(0.5 0 0))", fontSize: 10 }}
          tickCount={5}
        />
        {players.map((name, i) => (
          <Radar
            key={name}
            name={name}
            dataKey={name}
            stroke={PLAYER_COLORS[i % PLAYER_COLORS.length]}
            fill={PLAYER_COLORS[i % PLAYER_COLORS.length]}
            fillOpacity={0.15}
            strokeWidth={2}
          />
        ))}
        {players.length > 1 && <Legend />}
      </RadarChart>
    </ResponsiveContainer>
  )
}

const fmt = (v: number) =>
  Number.isInteger(v) ? String(v) : v.toFixed(v < 10 ? 2 : 1)

export function StatBarChart({
  data,
  players,
  scale,
}: {
  data: Record<string, string | number>[]
  players: string[]
  /**
   * Bar length denominator per stat label. Without it the bar is scaled to
   * the largest value in its own row, which is what you want when comparing
   * players side by side and meaningless with one: the single value is its
   * own maximum, so every bar renders full. The player page passes the
   * positional cohort's spread instead.
   */
  scale?: Record<string, number>
}) {
  return (
    <div className="space-y-3">
      {data.map((row) => {
        const vals = players.map((p) => Number(row[p]) || 0)
        const max = scale?.[row.stat as string] ?? Math.max(...vals, 0.01)

        return (
          <div key={row.stat as string}>
            <div className="text-[0.7rem] text-muted-foreground uppercase tracking-wider mb-1.5">
              {row.stat}
            </div>
            <div className="space-y-1">
              {players.map((name, i) => {
                const v = vals[i]
                const pct = Math.min(100, (v / max) * 100)
                return (
                  <div key={name} className="flex items-center gap-2">
                    <div className="flex-1 h-[10px] rounded-full overflow-hidden bg-black/5 dark:bg-white/[0.04]">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.max(pct, 1)}%`,
                          background: PLAYER_COLORS[i % PLAYER_COLORS.length],
                          // Dimming is a comparison cue: it marks the bars
                          // that are not the longest in their row. With one
                          // player there is nothing to lose to, so every bar
                          // was drawn at 0.45 for no reason.
                          opacity:
                            players.length > 1 ? (v === max ? 0.95 : 0.5) : 1,
                        }}
                      />
                    </div>
                    <span
                      className="text-xs tabular-nums font-medium w-10 text-right shrink-0"
                      style={{
                        color: v === max && players.length > 1
                          ? PLAYER_COLORS[i % PLAYER_COLORS.length]
                          : "var(--foreground)",
                      }}
                    >
                      {fmt(v)}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {players.length > 1 && (
        <div className="flex items-center gap-4 pt-2 border-t border-border/60">
          {players.map((name, i) => (
            <div key={name} className="flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ background: PLAYER_COLORS[i % PLAYER_COLORS.length] }}
              />
              <span className="text-[0.65rem] text-muted-foreground truncate">{name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
