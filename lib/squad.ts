/**
 * The Barça squad view. `bucket` matches the `position` column verbatim —
 * Sofascore's four broad buckets, which is all the loader stores (see
 * POSITIONS in data_loader.py). The finer `detailed_position` is a label
 * only; it isn't reliable enough to filter on.
 */
export const SQUAD_POSITIONS = [
  { key: "all", label: "All", bucket: null },
  { key: "gk", label: "Goalkeepers", bucket: "Goalkeeper" },
  { key: "def", label: "Defenders", bucket: "Defender" },
  { key: "mid", label: "Midfielders", bucket: "Midfielder" },
  { key: "fwd", label: "Forwards", bucket: "Forward" },
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
