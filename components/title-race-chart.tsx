"use client"

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

/**
 * The points gap to each rival after every round. Above the zero line is
 * ahead. The dashed line is the same gap to the main rival on expected
 * points: where the solid line sits above it, the lead is bigger than the
 * chances have earned.
 */
export function TitleRaceChart({
  rows,
  rivals,
  deservedLabel,
}: {
  rows: Record<string, number>[]
  rivals: { team: string; color: string }[]
  deservedLabel: string
}) {
  return (
    <ResponsiveContainer width="100%" height={230}>
      <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
        <CartesianGrid stroke="var(--chart-grid, var(--border))" vertical={false} />
        <XAxis
          dataKey="round"
          tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
        />
        <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.6} />
        <Tooltip
          cursor={{ stroke: "var(--border)" }}
          contentStyle={{
            background: "var(--popover)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            fontSize: 12,
          }}
          labelFormatter={(r) => `After round ${r}`}
          formatter={(v) => (Number(v) > 0 ? `+${v}` : `${v}`)}
        />
        <Line
          dataKey="deserved"
          name={deservedLabel}
          stroke={rivals[0]?.color}
          strokeDasharray="4 4"
          strokeOpacity={0.7}
          strokeWidth={1.5}
          dot={false}
          type="monotone"
        />
        {rivals.map((r, i) => (
          <Line
            key={r.team}
            dataKey={r.team}
            name={`vs ${r.team}`}
            stroke={r.color}
            strokeWidth={i === 0 ? 2.5 : 1.5}
            strokeOpacity={i === 0 ? 1 : 0.6}
            dot={false}
            type="monotone"
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
