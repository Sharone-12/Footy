"use client"

import { useMemo, useState } from "react"
import {
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts"
import { LeagueCrest } from "@/components/player-avatar"
import { LEAGUE_TOURNAMENT_ID } from "@/lib/teams"

/**
 * Any two season totals, plotted against each other.
 *
 * Totals rather than per-90, deliberately: the ask was for actual numbers.
 * It does mean both axes reward minutes played, which is why the bubble is
 * sized by minutes — a large circle sitting low is a player who had the game
 * time and did not produce, which reads as information rather than as a
 * distortion to apologise for.
 *
 * Only outliers carry a name. The charts this imitates label every point,
 * which works as a poster and fails as a tool: names collide into a smear
 * wherever the data is dense, and with roughly 1900 eligible players it
 * would be far worse here. Everyone else is one hover away.
 */

export type ScatterPlayer = {
  player: string
  slug: string
  team: string
  league: string
  role: string | null
  minutes: number | null
  npxg: number | null
  xa: number | null
  goals: number | null
  assists: number | null
  dribbles: number | null
  shots: number | null
  key_passes: number | null
  big_chances_created: number | null
  touches: number | null
  passes: number | null
  final_third_passes: number | null
  crosses: number | null
  tackles_won: number | null
  interceptions: number | null
  recoveries: number | null
  clearances: number | null
  aerials_won: number | null
  dispossessed: number | null
}

const n = (v: number | null | undefined) => (typeof v === "number" ? v : 0)

/** `get` rather than a column name, so composites like npxG+xA are first class. */
type Metric = { key: string; label: string; get: (p: ScatterPlayer) => number }

const METRICS: Metric[] = [
  { key: "npxg_xa", label: "npxG + xA", get: (p) => n(p.npxg) + n(p.xa) },
  { key: "npxg", label: "npxG", get: (p) => n(p.npxg) },
  { key: "xa", label: "xA", get: (p) => n(p.xa) },
  { key: "ga", label: "Goals + assists", get: (p) => n(p.goals) + n(p.assists) },
  { key: "goals", label: "Goals", get: (p) => n(p.goals) },
  { key: "assists", label: "Assists", get: (p) => n(p.assists) },
  { key: "dribbles", label: "Successful dribbles", get: (p) => n(p.dribbles) },
  { key: "shots", label: "Shots", get: (p) => n(p.shots) },
  { key: "key_passes", label: "Key passes", get: (p) => n(p.key_passes) },
  { key: "bcc", label: "Big chances created", get: (p) => n(p.big_chances_created) },
  { key: "touches", label: "Touches", get: (p) => n(p.touches) },
  { key: "passes", label: "Accurate passes", get: (p) => n(p.passes) },
  { key: "f3", label: "Final third passes", get: (p) => n(p.final_third_passes) },
  { key: "crosses", label: "Accurate crosses", get: (p) => n(p.crosses) },
  { key: "tackles_won", label: "Tackles won", get: (p) => n(p.tackles_won) },
  { key: "interceptions", label: "Interceptions", get: (p) => n(p.interceptions) },
  { key: "recoveries", label: "Recoveries", get: (p) => n(p.recoveries) },
  { key: "clearances", label: "Clearances", get: (p) => n(p.clearances) },
  { key: "aerials_won", label: "Aerial duels won", get: (p) => n(p.aerials_won) },
  { key: "dispossessed", label: "Dispossessed", get: (p) => n(p.dispossessed) },
  { key: "minutes", label: "Minutes", get: (p) => n(p.minutes) },
]

const LEAGUE_COLOR: Record<string, string> = {
  "Premier League": "oklch(0.70 0.19 300)",
  "La Liga": "oklch(0.80 0.16 70)",
  "Serie A": "oklch(0.70 0.19 250)",
  "Ligue 1": "oklch(0.78 0.15 200)",
  Bundesliga: "oklch(0.68 0.20 25)",
  "Champions League": "oklch(0.72 0.14 265)",
}
const OTHER = "oklch(0.70 0.02 250)"

export const UCL = "Champions League"

/**
 * "Top 5" deliberately excludes the Champions League rather than adding to
 * it. A player holds one row per competition, so a filter that showed both
 * at once would plot Yamal twice — once for La Liga and once for Europe —
 * at two different points. UCL is its own view, never a top-up.
 */
const TOP5 = ["Premier League", "La Liga", "Serie A", "Ligue 1", "Bundesliga"]
/** Fallback only: the chips show crests, this is for when one will not load. */
const ABBR: Record<string, string> = {
  "Premier League": "PL",
  "La Liga": "LL",
  "Serie A": "SA",
  "Ligue 1": "L1",
  Bundesliga: "BL",
  [UCL]: "UCL",
}

/**
 * A few sane cuts rather than a free slider.
 *
 * 180 exists for the Champions League: its league phase is a handful of
 * matchdays, so nobody clears 450 and the chart came back empty.
 */
const FLOORS = [0, 180, 450, 900, 1350]

/**
 * Comparing like with like is most of what makes a chart like this readable.
 * Plot everyone and centre-forwards own the npxG axis, which buries the
 * wingers against each other — the published versions of this chart are
 * almost always one role at a time, and leaving it out was the difference
 * between "Yamal is alone out there" and "Yamal is somewhere in a cloud".
 */
const ROLES = [
  "Winger",
  "Striker",
  "Attacking Mid",
  "Central Mid",
  "Full-Back",
  "Centre-Back",
  "Goalkeeper",
]

const LABEL_COUNT = 14

/**
 * Keep-out box around a placed label, as a fraction of each axis.
 *
 * Sized from what actually renders, not from taste: the text sits to the
 * right of its dot and runs about 110px, which on a ~980px plot is ~0.11 of
 * the x range. Measured both ways: names 0.09 apart did overlap on screen,
 * names 0.16 apart did not, so the box sits between them. Wider than that
 * and it starts dropping genuinely notable points to protect nothing.
 */
const LABEL_GAP_X = 0.13
const LABEL_GAP_Y = 0.055

export function MetricScatter({ players }: { players: ScatterPlayer[] }) {
  const [xKey, setXKey] = useState("dribbles")
  const [yKey, setYKey] = useState("npxg_xa")
  const [floor, setFloor] = useState(450)
  const [role, setRole] = useState("Winger")
  // A set, so leagues combine. UCL stays exclusive: a player holds one row
  // per competition, so pairing it with a domestic league would plot the same
  // man twice, at two different points, as if he were two players.
  const [leagues, setLeagues] = useState<string[]>(TOP5)

  function toggleLeague(lg: string) {
    setLeagues((cur) => {
      if (lg === UCL) return cur.includes(UCL) ? TOP5 : [UCL]
      const base = cur.filter((l) => l !== UCL)
      const next = base.includes(lg) ? base.filter((l) => l !== lg) : [...base, lg]
      return next.length ? next : [lg]
    })
  }

  const xm = METRICS.find((m) => m.key === xKey) ?? METRICS[0]
  const ym = METRICS.find((m) => m.key === yKey) ?? METRICS[0]

  const { points, shownLeagues } = useMemo(() => {
    const raw = players
      .filter(
        (p) =>
          n(p.minutes) >= floor &&
          (role === "all" || p.role === role) &&
          leagues.includes(p.league),
      )
      .map((p) => ({
        x: xm.get(p),
        y: ym.get(p),
        z: Math.max(1, n(p.minutes)),
        player: p.player,
        team: p.team,
        league: p.league,
        minutes: n(p.minutes),
        label: "",
      }))

    // Outliers by distance from the origin in normalised space, so neither
    // axis wins the argument just by carrying bigger numbers.
    const maxX = Math.max(1, ...raw.map((r) => r.x))
    const maxY = Math.max(1, ...raw.map((r) => r.y))
    const ranked = [...raw].sort(
      (a, b) =>
        (b.x / maxX) ** 2 + (b.y / maxY) ** 2 - ((a.x / maxX) ** 2 + (a.y / maxY) ** 2),
    )

    // Greedy de-collision. Ranking alone still stacks names wherever two
    // outliers sit close together, which is the exact failure this chart is
    // meant to avoid — so a candidate is skipped if an already-labelled point
    // is within roughly a label's width and height of it, in normalised space.
    const placed: { x: number; y: number }[] = []
    for (const r of ranked) {
      if (placed.length >= LABEL_COUNT) break
      const nx = r.x / maxX
      const ny = r.y / maxY
      const clash = placed.some(
        (q) => Math.abs(q.x - nx) < LABEL_GAP_X && Math.abs(q.y - ny) < LABEL_GAP_Y,
      )
      if (clash) continue
      r.label = r.player
      placed.push({ x: nx, y: ny })
    }

    return { points: raw, shownLeagues: [...new Set(raw.map((r) => r.league))].sort() }
  }, [players, xm, ym, floor, role, leagues])

  return (
    <section className="surface rounded-2xl bg-card border border-border/70 p-3.5 sm:p-5 shadow-sm">
      <div className="flex flex-wrap items-end gap-2.5 mb-4">
        <Picker label="Y axis" value={yKey} onChange={setYKey} />
        <Picker label="X axis" value={xKey} onChange={setXKey} />
        <label className="flex flex-col gap-1">
          <span className="stat-label text-[0.65rem]">Role</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="bg-neutral-900 border border-border/70 rounded-lg px-2.5 py-1.5 text-xs font-medium text-foreground"
          >
            <option value="all">All roles</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="stat-label text-[0.65rem]">Min minutes</span>
          <select
            value={floor}
            onChange={(e) => setFloor(Number(e.target.value))}
            className="bg-neutral-900 border border-border/70 rounded-lg px-2.5 py-1.5 text-xs font-medium text-foreground"
          >
            {FLOORS.map((f) => (
              <option key={f} value={f}>
                {f === 0 ? "No minimum" : `${f}+`}
              </option>
            ))}
          </select>
        </label>
        <span className="stat-label text-[0.65rem] ml-auto pb-2">
          {points.length} players · bubble = minutes
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mb-4">
        {[...TOP5, UCL].map((lg) => {
          const on = leagues.includes(lg)
          return (
            <button
              key={lg}
              type="button"
              onClick={() => toggleLeague(lg)}
              aria-pressed={on}
              aria-label={lg}
              title={lg}
              className={`inline-flex items-center justify-center rounded-full border p-1.5 transition-all ${
                on
                  ? "opacity-100"
                  : "border-border/60 opacity-35 grayscale hover:opacity-70"
              }`}
              style={
                on
                  ? {
                      // Tinted with the colour this league's dots carry, so the
                      // chip and the scatter read as the same thing.
                      borderColor: LEAGUE_COLOR[lg] ?? OTHER,
                      background: `color-mix(in oklab, ${LEAGUE_COLOR[lg] ?? OTHER} 16%, transparent)`,
                    }
                  : undefined
              }
            >
              {LEAGUE_TOURNAMENT_ID[lg] ? (
                <LeagueCrest tournamentId={LEAGUE_TOURNAMENT_ID[lg]} name={lg} size={20} />
              ) : (
                <span className="text-[11px] font-bold px-1">{ABBR[lg] ?? lg}</span>
              )}
            </button>
          )
        })}
      </div>

      {points.length === 0 ? (
        // Short competitions trip the minutes floor, so say so rather than
        // leaving an empty grid that looks broken.
        <div className="h-[260px] flex flex-col items-center justify-center text-center gap-1.5">
          <p className="text-sm font-semibold text-foreground">No players match</p>
          <p className="stat-label text-[0.7rem] max-w-xs">
            Try a lower minutes floor — a short competition like the Champions
            League league phase has few players past 450 minutes.
          </p>
        </div>
      ) : (
      <div className="h-[420px] sm:h-[560px] w-full">
        <ResponsiveContainer>
          <ScatterChart margin={{ top: 12, right: 30, bottom: 36, left: 8 }}>
            <CartesianGrid stroke="oklch(1 0 0 / 7%)" />
            <XAxis
              type="number"
              dataKey="x"
              name={xm.label}
              tick={{ fontSize: 11, fill: "oklch(0.72 0.02 250)" }}
              stroke="oklch(1 0 0 / 18%)"
              label={{
                value: xm.label,
                position: "insideBottom",
                offset: -18,
                fill: "oklch(0.72 0.02 250)",
                fontSize: 12,
              }}
            />
            <YAxis
              type="number"
              dataKey="y"
              name={ym.label}
              tick={{ fontSize: 11, fill: "oklch(0.72 0.02 250)" }}
              stroke="oklch(1 0 0 / 18%)"
              label={{
                value: ym.label,
                angle: -90,
                position: "insideLeft",
                fill: "oklch(0.72 0.02 250)",
                fontSize: 12,
              }}
            />
            <ZAxis type="number" dataKey="z" range={[18, 320]} />
            <Tooltip
              cursor={{ strokeDasharray: "3 3", stroke: "oklch(1 0 0 / 25%)" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const d = payload[0].payload as (typeof points)[number]
                return (
                  <div className="surface-raised rounded-lg bg-popover border border-border/70 px-3 py-2 text-xs shadow-lg">
                    <div className="font-bold text-foreground">{d.player}</div>
                    <div className="text-muted-foreground">
                      {d.team} · {d.league}
                    </div>
                    <div className="mt-1 font-mono tabular-nums text-foreground">
                      {ym.label}: {d.y.toFixed(2)}
                    </div>
                    <div className="font-mono tabular-nums text-foreground">
                      {xm.label}: {d.x.toFixed(2)}
                    </div>
                    <div className="font-mono tabular-nums text-muted-foreground">
                      {d.minutes} minutes
                    </div>
                  </div>
                )
              }}
            />
            <Scatter data={points} fillOpacity={0.78} isAnimationActive={false}>
              {points.map((p, i) => (
                <Cell key={i} fill={LEAGUE_COLOR[p.league] ?? OTHER} />
              ))}
              <LabelList
                dataKey="label"
                position="right"
                offset={8}
                style={{ fontSize: 10, fill: "oklch(0.95 0 0)", fontWeight: 600 }}
              />
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 pt-3 border-t border-white/10">
        {shownLeagues.map((lg) => (
          <span key={lg} className="inline-flex items-center gap-1.5">
            <span
              className="size-2.5 rounded-full"
              style={{ background: LEAGUE_COLOR[lg] ?? OTHER }}
            />
            <span className="stat-label text-[0.65rem]">{lg}</span>
          </span>
        ))}
      </div>
    </section>
  )
}

function Picker({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="stat-label text-[0.65rem]">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-neutral-900 border border-border/70 rounded-lg px-2.5 py-1.5 text-xs font-medium text-foreground max-w-[190px]"
      >
        {METRICS.map((m) => (
          <option key={m.key} value={m.key}>
            {m.label}
          </option>
        ))}
      </select>
    </label>
  )
}
