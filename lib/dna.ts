/**
 * Player DNA: a style fingerprint, the players it most resembles, and a named
 * archetype.
 *
 * Everything here is shape, not quality. Each stat is a z-score against every
 * outfielder in the cohort, so a vector says "does more of this and less of
 * that than the average player" — and two players match when their vectors
 * point the same way, whatever their output. That is why similarity is cosine
 * rather than distance: a quiet season of the same kind of football still
 * reads as the same kind of player.
 */

export type DnaRow = Record<string, unknown>

/** The per-90 columns that describe how someone plays, in display order. */
export const DNA_KEYS = [
  { key: "goals_p90", label: "Goals" },
  { key: "xg_p90", label: "xG" },
  { key: "shots_on_target_p90", label: "Shots on target" },
  { key: "assists_p90", label: "Assists" },
  { key: "xa_p90", label: "xA" },
  { key: "key_passes_p90", label: "Key passes" },
  { key: "big_chances_created_p90", label: "Big chances created" },
  { key: "crosses_p90", label: "Crosses" },
  { key: "dribbles_p90", label: "Dribbles" },
  { key: "touches_p90", label: "Touches" },
  { key: "passes_p90", label: "Passes" },
  { key: "final_third_passes_p90", label: "Final-third passes" },
  { key: "long_balls_p90", label: "Long balls" },
  { key: "recoveries_p90", label: "Recoveries" },
  { key: "tackles_won_p90", label: "Tackles won" },
  { key: "interceptions_p90", label: "Interceptions" },
  { key: "clearances_p90", label: "Clearances" },
  { key: "blocked_shots_p90", label: "Blocked shots" },
  { key: "aerials_won_p90", label: "Aerials won" },
] as const

type Key = (typeof DNA_KEYS)[number]["key"]

/**
 * Named styles. A player's archetype is the one whose traits they exceed the
 * cohort average on by the most. Rule-based on purpose rather than k-means:
 * clusters shift every refresh and come back unlabelled, while these stay put
 * and each one can say exactly why a player landed in it.
 */
export const ARCHETYPES: {
  name: string
  blurb: string
  /** Roles this style is offered to. Without it a centre-back's passing volume
   *  made Virgil van Dijk a "Deep Playmaker": true of the numbers, wrong of the job. */
  roles: string[]
  traits: Partial<Record<Key, number>>
}[] = [
  {
    name: "Poacher",
    roles: ["Striker", "Winger", "Attacking Mid"],
    blurb: "Lives on the end of chances; little involvement outside the box.",
    traits: { goals_p90: 1.5, xg_p90: 1.5, shots_on_target_p90: 1, touches_p90: -0.5, passes_p90: -0.5 },
  },
  {
    name: "Target Forward",
    roles: ["Striker"],
    blurb: "Wins the first ball and finishes moves in the air.",
    traits: { aerials_won_p90: 1.5, xg_p90: 1, goals_p90: 1, dribbles_p90: -0.5 },
  },
  {
    name: "Wide Carrier",
    roles: ["Winger", "Striker", "Attacking Mid", "Full-Back"],
    blurb: "Beats a man, drives at the back line, delivers from wide.",
    traits: { dribbles_p90: 2, crosses_p90: 1, xa_p90: 0.5, shots_on_target_p90: 0.5 },
  },
  {
    name: "Creator",
    roles: ["Attacking Mid", "Winger", "Striker", "Central Mid", "Full-Back"],
    blurb: "The final pass: manufactures chances for others.",
    traits: { key_passes_p90: 1.5, xa_p90: 1.5, big_chances_created_p90: 1.5, assists_p90: 0.5 },
  },
  {
    name: "Deep Playmaker",
    roles: ["Central Mid"],
    blurb: "Sets the tempo from deep with volume and range of passing.",
    traits: { passes_p90: 1.5, long_balls_p90: 1, touches_p90: 1, final_third_passes_p90: 0.5, dribbles_p90: -0.5 },
  },
  {
    name: "Box-to-Box",
    roles: ["Central Mid", "Attacking Mid"],
    blurb: "Covers both ends: wins it back and carries it forward.",
    traits: { recoveries_p90: 1, tackles_won_p90: 1, final_third_passes_p90: 1, shots_on_target_p90: 0.5, dribbles_p90: 0.5 },
  },
  {
    name: "Ball-Winner",
    roles: ["Central Mid", "Centre-Back", "Full-Back"],
    blurb: "Breaks up play: tackles, interceptions, second balls.",
    traits: { tackles_won_p90: 1.5, interceptions_p90: 1.5, recoveries_p90: 1 },
  },
  {
    name: "Stopper",
    roles: ["Centre-Back", "Full-Back"],
    blurb: "Defends the box: clears, blocks and wins headers.",
    traits: { clearances_p90: 1.5, blocked_shots_p90: 1, aerials_won_p90: 1, passes_p90: -0.5 },
  },
  {
    name: "Ball-Playing Defender",
    roles: ["Centre-Back"],
    blurb: "Builds from the back and reads the pass before it is played.",
    traits: { passes_p90: 1.5, long_balls_p90: 1, interceptions_p90: 1, clearances_p90: -0.5, dribbles_p90: -0.5, key_passes_p90: -0.5 },
  },
  {
    name: "Attacking Full-Back",
    roles: ["Full-Back"],
    blurb: "Defends the flank, then overlaps and crosses.",
    traits: { crosses_p90: 1.5, tackles_won_p90: 1, final_third_passes_p90: 0.5, key_passes_p90: 0.5, goals_p90: -0.5 },
  },
]

export type Fingerprint = {
  slug: string
  player: string
  team: string
  team_id: number | null
  league: string
  role: string
  minutes: number
  /** z-scores in DNA_KEYS order, clamped to ±3 so one outlier stat can't own the match. */
  z: number[]
}

const num = (v: unknown) => Number(v) || 0

/** Mean and standard deviation of every DNA stat across a cohort. */
export function cohortScale(rows: DnaRow[]): { mean: number[]; sd: number[] } {
  const mean: number[] = []
  const sd: number[] = []
  for (const { key } of DNA_KEYS) {
    const vals = rows.map((r) => num(r[key]))
    const m = vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length)
    const variance = vals.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, vals.length)
    mean.push(m)
    // A stat nobody varies on carries no style signal; 1 keeps its z at 0-ish.
    sd.push(Math.sqrt(variance) || 1)
  }
  return { mean, sd }
}

export function fingerprint(row: DnaRow, scale: { mean: number[]; sd: number[] }): Fingerprint {
  return {
    slug: String(row.slug ?? ""),
    player: String(row.player ?? ""),
    team: String(row.team ?? ""),
    team_id: row.team_id == null ? null : Number(row.team_id),
    league: String(row.league ?? ""),
    role: String(row.role ?? row.position ?? ""),
    minutes: num(row.minutes),
    z: DNA_KEYS.map(({ key }, i) =>
      Math.max(-3, Math.min(3, (num(row[key]) - scale.mean[i]) / scale.sd[i])),
    ),
  }
}

/** Cosine similarity of two style vectors, -1..1. */
export function cosine(a: number[], b: number[]): number {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0
}

export type Match = Fingerprint & { similarity: number }

/** Everyone else in the pool, most alike first. `similarity` is 0-100. */
export function similarPlayers(target: Fingerprint, pool: Fingerprint[]): Match[] {
  return pool
    .filter((p) => p.slug !== target.slug)
    .map((p) => ({ ...p, similarity: Math.round(Math.max(0, cosine(target.z, p.z)) * 100) }))
    .sort((a, b) => b.similarity - a.similarity)
}

export type ArchetypeFit = { name: string; blurb: string; fit: number }

/**
 * Archetypes ranked by fit. `fit` is the weighted mean z across the
 * archetype's traits, so 1.0 reads as "a standard deviation above the average
 * outfielder on what defines this style".
 */
export function archetypes(fp: Fingerprint): ArchetypeFit[] {
  const index = new Map(DNA_KEYS.map(({ key }, i) => [key, i]))
  // An unrecognised role is offered every style rather than none.
  const offered = ARCHETYPES.filter((a) => a.roles.includes(fp.role))
  return (offered.length ? offered : ARCHETYPES).map((a) => {
    let acc = 0
    let weight = 0
    for (const [key, w] of Object.entries(a.traits) as [Key, number][]) {
      acc += fp.z[index.get(key)!] * w
      weight += Math.abs(w)
    }
    return { name: a.name, blurb: a.blurb, fit: Math.round((acc / weight) * 100) / 100 }
  }).sort((a, b) => b.fit - a.fit)
}
