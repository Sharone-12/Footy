/**
 * Squad leaderboards by role.
 *
 * `role` is the finer grouping the loader derives from Sofascore's
 * /characteristics endpoint (ROLE_MAP in data_loader.py) — Centre-Back and
 * Full-Back instead of one "Defender", Winger instead of "Midfielder". The
 * squad sheet filters on the broad `position`; this ranks on `role`, because
 * clearances mean nothing when a full-back and a centre-back share a column.
 *
 * Every metric below is a column already in `players`. No new ingestion.
 */

export type Metric = {
  col: string
  label: string
  /** Decimal places; p90 rates need one, counts need none. */
  digits?: number
}

export type RoleSpec = {
  role: string
  label: string
  /** The column the board is sorted by, descending. */
  headline: Metric
  columns: Metric[]
  note?: string
}

/**
 * A per-90 rate from one substitute appearance is noise, so a player needs
 * two matches' worth of minutes to be ranked on one.
 */
export const MIN_MINUTES = 180

export const ROLE_SPECS: RoleSpec[] = [
  {
    role: "Goalkeeper",
    label: "Goalkeepers",
    // Saves, claims and sweeper actions aren't in the ingested field set, so
    // there is no honest shot-stopping ranking here — this shows the rotation
    // and distribution instead of inventing a rating.
    headline: { col: "minutes", label: "Minutes" },
    columns: [
      { col: "passes_p90", label: "Passes/90", digits: 1 },
      { col: "long_balls_p90", label: "Long/90", digits: 1 },
      { col: "errors_to_goal", label: "Errors" },
    ],
    note: "Save data isn't in the ingested stat set, so these are distribution and minutes only.",
  },
  {
    role: "Centre-Back",
    label: "Centre-Backs",
    headline: { col: "clearances_p90", label: "Clearances/90", digits: 1 },
    columns: [
      { col: "interceptions_p90", label: "Int/90", digits: 1 },
      { col: "aerials_won_p90", label: "Aerials/90", digits: 1 },
      { col: "blocked_shots_p90", label: "Blocks/90", digits: 1 },
    ],
  },
  {
    role: "Full-Back",
    label: "Full-Backs",
    headline: { col: "crosses_p90", label: "Crosses/90", digits: 1 },
    columns: [
      { col: "key_passes_p90", label: "Key P/90", digits: 1 },
      { col: "dribbles_p90", label: "Dribbles/90", digits: 1 },
      { col: "tackles_won_p90", label: "Tackles/90", digits: 1 },
    ],
  },
  {
    role: "Central Mid",
    label: "Central Midfielders",
    headline: { col: "passes_p90", label: "Passes/90", digits: 1 },
    columns: [
      { col: "key_passes_p90", label: "Key P/90", digits: 1 },
      { col: "recoveries_p90", label: "Recov/90", digits: 1 },
      { col: "total_tackles_p90", label: "Tackles/90", digits: 1 },
    ],
  },
  {
    role: "Attacking Mid",
    label: "Attacking Midfielders",
    headline: { col: "xa_p90", label: "xA/90", digits: 2 },
    columns: [
      { col: "key_passes_p90", label: "Key P/90", digits: 1 },
      { col: "dribbles_p90", label: "Dribbles/90", digits: 1 },
      { col: "goals_p90", label: "Goals/90", digits: 2 },
    ],
  },
  {
    role: "Winger",
    label: "Wingers",
    headline: { col: "dribbles_p90", label: "Dribbles/90", digits: 1 },
    columns: [
      { col: "xa_p90", label: "xA/90", digits: 2 },
      { col: "goals_p90", label: "Goals/90", digits: 2 },
      { col: "key_passes_p90", label: "Key P/90", digits: 1 },
    ],
  },
  {
    role: "Striker",
    label: "Strikers",
    headline: { col: "xg_p90", label: "xG/90", digits: 2 },
    columns: [
      { col: "goals_p90", label: "Goals/90", digits: 2 },
      { col: "shots_on_target_p90", label: "On Target/90", digits: 1 },
      { col: "big_chances_missed", label: "Big Miss" },
    ],
  },
]

/** A players row, as far as a leaderboard cares. */
export type Ranked = {
  player_id: number
  player: string
  slug: string
  role: string | null
  minutes: number | null
} & Record<string, unknown>

export const num = (v: unknown): number | null =>
  v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v)

/**
 * The players eligible for one role's board, best first.
 *
 * A null headline value sorts last rather than as zero — "not recorded" and
 * "none" are different, and treating them alike would rank a missing column
 * above a genuine zero.
 */
export function rank(players: Ranked[], spec: RoleSpec): Ranked[] {
  const floor = spec.headline.col.endsWith("_p90") ? MIN_MINUTES : 0
  return players
    .filter((p) => p.role === spec.role && (num(p.minutes) ?? 0) >= floor)
    .sort((a, b) => {
      const x = num(a[spec.headline.col])
      const y = num(b[spec.headline.col])
      if (x == null) return y == null ? 0 : 1
      if (y == null) return -1
      return y - x
    })
}

/** Format one cell, with an em dash for a value the data doesn't have. */
export function cell(value: unknown, metric: Metric): string {
  const n = num(value)
  return n == null ? "—" : n.toFixed(metric.digits ?? 0)
}

/** Display names for the metric keys used across ROLE_PROFILES. */
export const METRIC_LABEL: Record<string, string> = {
  goals_p90: "Goals",
  assists_p90: "Assists",
  xg_p90: "xG",
  xa_p90: "xA",
  shots_on_target_p90: "On Target",
  big_chances_missed_p90: "Big Miss",
  big_chances_created_p90: "Big Chc",
  key_passes_p90: "Key Pass",
  passes_p90: "Passes",
  final_third_passes_p90: "Final 3rd",
  long_balls_p90: "Long",
  crosses_p90: "Crosses",
  dribbles_p90: "Dribbles",
  dispossessed_p90: "Lost Ball",
  touches_p90: "Touches",
  recoveries_p90: "Recov",
  tackles_won_p90: "Tackles",
  interceptions_p90: "Int",
  clearances_p90: "Clear",
  blocked_shots_p90: "Blocks",
  aerials_won_p90: "Aerials",
}

/** The shape of one ROLE_PROFILES entry, restated so this module stays
 *  importable by the plain-node self-check (lib/rank.ts uses @/ aliases). */
export type Weight = { key: string; weight: number; invert?: boolean }

export type ProfileMetric = {
  key: string
  /** Header text, e.g. "Goals" or "Dribbles/90". */
  label: string
  /** The players column to read the displayed value from. */
  source: string
  digits: number
  invert?: boolean
}

const OUTPUT_FIRST = ["goals_p90", "assists_p90"]

/**
 * Columns shown as season totals rather than rates — "15 goals" is the
 * number anyone actually wants, where "0.73/90" buries it.
 */
const AS_TOTAL: Record<string, string> = { goals_p90: "goals", assists_p90: "assists" }

/** Expected-goals style metrics are small; everything else reads fine at 1dp. */
const digitsFor = (key: string) => (key.startsWith("xg") || key.startsWith("xa") ? 2 : 1)

export function topMetrics(profile: Weight[] | undefined, n = 4): ProfileMetric[] {
  if (!profile) return []
  const byWeight = [...profile].sort((a, b) => b.weight - a.weight)
  // Scoring output is pinned to the front when the profile contains it.
  // Winger has five metrics tied at 1.5, so goals lost the tie-break and an
  // attacking board ended up showing no goals column at all — which reads as
  // "scoring is ignored" even though it is 28% of the winger weighting.
  // Pinned in OUTPUT_FIRST order, not weight order, so goals sits before
  // assists on every board instead of flipping where their weights tie.
  const pinned = OUTPUT_FIRST.map((k) => byWeight.find((w) => w.key === k)).filter(
    (w): w is Weight => w != null,
  )
  const rest = byWeight.filter((w) => !OUTPUT_FIRST.includes(w.key))
  return [...pinned, ...rest].slice(0, n).map((w) => {
    const total = AS_TOTAL[w.key]
    const name = METRIC_LABEL[w.key] ?? w.key
    return {
      key: w.key,
      label: total ? name : `${name}/90`,
      source: total ?? w.key,
      digits: total ? 0 : digitsFor(w.key),
      invert: w.invert,
    }
  })
}

/**
 * Counting columns in `players`. Each has a matching `<col>_p90` that is
 * derived, never summed — adding two rates together is meaningless.
 */
export const SUM_COLS = [
  "goals", "assists", "xg", "xa", "shots", "shots_on_target",
  "big_chances_created", "big_chances_missed", "passes", "total_passes",
  "key_passes", "long_balls", "total_long_balls", "crosses", "total_crosses",
  "final_third_passes", "dribbles", "total_dribbles", "dispossessed",
  "touches", "tackles_won", "total_tackles", "interceptions", "recoveries",
  "clearances", "blocked_shots", "errors_to_goal", "aerials_won",
  "total_aerials", "yellows", "reds", "penalties_won", "penalties_conceded",
  "appearances",
]

/**
 * Fold a player's per-competition rows into one.
 *
 * A player holds a separate row per competition, so a cohort built straight
 * from the table contains the same person twice and the percentiles are
 * computed against a pool that is partly duplicates. Totals are summed,
 * minutes are summed, and every rate is recomputed from those sums — a
 * league rate and a Champions League rate cannot simply be averaged, because
 * they rest on different minute counts.
 *
 * Identity fields come from whichever competition the player featured in
 * most, so the label reflects their main one.
 */
export function combineCompetitions<T extends Record<string, unknown>>(rows: T[]): T[] {
  const groups = new Map<unknown, T[]>()
  for (const row of rows) {
    const id = row.player_id ?? row.slug
    const list = groups.get(id)
    if (list) list.push(row)
    else groups.set(id, [row])
  }

  const out: T[] = []
  for (const group of groups.values()) {
    if (group.length === 1) {
      out.push(group[0])
      continue
    }
    const base = [...group].sort((a, b) => (num(b.minutes) ?? 0) - (num(a.minutes) ?? 0))[0]
    const merged: Record<string, unknown> = { ...base }

    const minutes = group.reduce((t, r) => t + (num(r.minutes) ?? 0), 0)
    merged.minutes = minutes

    for (const col of SUM_COLS) {
      // A column absent from every row stays absent rather than becoming 0.
      if (!group.some((r) => r[col] != null && r[col] !== "")) continue
      const total = group.reduce((t, r) => t + (num(r[col]) ?? 0), 0)
      merged[col] = total
      if (`${col}_p90` in base) {
        merged[`${col}_p90`] = minutes > 0 ? (total / minutes) * 90 : 0
      }
    }
    out.push(merged as T)
  }
  return out
}
