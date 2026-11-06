import { UCL } from "@/lib/competition"

/**
 * The Barça squad view. `bucket` matches the `position` column verbatim —
 * Sofascore's four broad buckets, which is all the loader stores (see
 * POSITIONS in data_loader.py). The finer `detailed_position` is a label
 * only; it isn't reliable enough to filter on.
 */
export const SQUAD_POSITIONS = [
  { key: "all", label: "All", bucket: null },
  { key: "fwd", label: "Forwards", bucket: "Forward" },
  { key: "mid", label: "Midfielders", bucket: "Midfielder" },
  { key: "def", label: "Defenders", bucket: "Defender" },
  { key: "gk", label: "Goalkeepers", bucket: "Goalkeeper" },
] as const

export const DEFAULT_POSITION = "all"

/** Narrow an untrusted ?pos= value, falling back to "all". */
export function resolvePosition(value?: string | string[] | null): string {
  const v = Array.isArray(value) ? value[0] : value
  return SQUAD_POSITIONS.some((p) => p.key === v) ? (v as string) : DEFAULT_POSITION
}

/**
 * Sofascore files these two as midfielders off their listed slot; they play
 * and score as forwards (Yamal RW, Raphinha ST), so the squad sheet reads
 * wrong without this. Squad view only — `position` elsewhere drives peer-group
 * rankings and stays as the data has it.
 */
const SQUAD_POSITION_OVERRIDES: Record<string, string> = {
  "lamine-yamal": "Forward",
  raphinha: "Forward",
}

/** The position the squad sheet should show for a player. */
export function squadPosition(slug: string, position: string): string {
  return SQUAD_POSITION_OVERRIDES[slug] ?? position
}

export function bucketFor(key: string): string | null {
  return SQUAD_POSITIONS.find((p) => p.key === key)?.bucket ?? null
}

/**
 * "Robert Lewandowski" -> { first: "Robert", last: "Lewandowski" }, the way
 * squad sheets set names. Mononyms ("Pedri", "Raphinha") get no first line.
 */
export function splitName(name: string): { first: string; last: string } {
  const parts = name.trim().split(/\s+/)
  return parts.length > 1
    ? { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] }
    : { first: "", last: name }
}

/**
 * Scope for the Barça fixture list. The stats views can only ever show one
 * competition (mixing them ranks six UCL games against a league season), but
 * a fixture list honestly mixes, so this adds an "all" default on top of
 * ?comp='s league/ucl. The keys past "all" are the literal ?comp= values —
 * "ucl" is what switches the page-wide UCL skin on.
 */
export const FIXTURE_SCOPES = [
  { key: "all", label: "All" },
  { key: "league", label: "League" },
  { key: "ucl", label: "UCL" },
] as const

export type FixtureScope = (typeof FIXTURE_SCOPES)[number]["key"]

export const DEFAULT_FIXTURE_SCOPE: FixtureScope = "all"

/** Narrow an untrusted ?comp= value for the fixture list, defaulting to all. */
export function resolveFixtureScope(value?: string | string[] | null): FixtureScope {
  const v = Array.isArray(value) ? value[0] : value
  return FIXTURE_SCOPES.some((s) => s.key === v)
    ? (v as FixtureScope)
    : DEFAULT_FIXTURE_SCOPE
}

type Filterable = {
  eq(column: string, value: string): unknown
  neq(column: string, value: string): unknown
}

/**
 * Apply the fixture list's three-way scope to a `matches` query.
 *
 * One definition for every view on the page — the fixture list, the results
 * list and the form strip — because three hand-rolled copies is exactly how
 * the form strip ended up ignoring the filter.
 *
 * Q is left unconstrained for the same reason as scopeLeague in
 * lib/competition.ts: bounding it by the builder's own methods sends
 * TypeScript into "excessively deep" instantiation on supabase-js types.
 */
export function scopeFixtures<Q>(query: Q, scope: FixtureScope): Q {
  if (scope === "all") return query
  const q = query as unknown as Filterable
  return (scope === "ucl" ? q.eq("league", UCL) : q.neq("league", UCL)) as Q
}

/**
 * Roles the source data gets wrong for how a player is actually being used.
 *
 * Unlike SQUAD_POSITION_OVERRIDES above, this one DOES change rankings — that
 * is the point. Sofascore files Raphinha as LW off his nominal slot, but he
 * leads the squad in goals at a centre-forward's rate, and scoring him on a
 * winger profile judges him on dribbles and crosses instead of finishing.
 *
 * Keys are slugs; values must be roles from ROLE_MAP in data_loader.py.
 */
export const ROLE_OVERRIDES: Record<string, string> = {
  raphinha: "Striker",
}
