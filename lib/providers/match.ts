/**
 * Fixture ↔ candidate matching.
 *
 * Providers describe an event in whatever shape they like: some give
 * structured home/away fields, most give nothing but a video title. Both go
 * through one path — everything the candidate says is flattened into a
 * haystack, and the fixture's teams are looked for inside it.
 *
 * Both teams are a gate, not a score. "Barcelona v Girona" at the right time
 * in the right competition would otherwise clear the threshold on one team
 * plus metadata, which is the exact wrong answer.
 */
import type { Fixture } from "./types"
import { INTERNATIONAL_ALIASES, INTERNATIONAL_COMPETITIONS } from "../streaming/aliases.ts"

export type Candidate = {
  home?: string | null
  away?: string | null
  competition?: string | null
  kickoff?: string | null
  /** Free text, e.g. a video title, when there are no structured fields. */
  title?: string | null
}

/** Club suffixes and filler that appear in some renderings of a name and not
 *  others: "FC Barcelona" / "Barcelona", "Real Betis Balompié" / "Betis". */
const FILLER = new Set([
  "fc", "cf", "afc", "sc", "ac", "as", "ss", "cd", "rc", "rcd", "ud", "sd",
  "bsc", "vfb", "vfl", "tsg", "fsv", "sv", "club", "de", "futbol", "football",
  "calcio", "balompie", "the",
])

/** Many spellings → one canonical name. Seeded from the clubs ingested by
 *  LEAGUES in data_loader.py; extend as providers surface new renderings. */
const ALIASES: Record<string, string[]> = {
  barcelona: ["barca", "fc barcelona", "barcelona fc", "fcb"],
  "real madrid": ["madrid", "real"],
  "atletico madrid": ["atleti", "atletico de madrid", "atlético madrid"],
  "paris saint germain": ["psg", "paris sg", "paris st germain"],
  "bayern munchen": ["bayern", "bayern munich", "fc bayern munchen", "bayern münchen"],
  "manchester united": ["man united", "man utd", "manutd", "mufc"],
  "manchester city": ["man city", "mancity", "mcfc"],
  tottenham: ["tottenham hotspur", "spurs"],
  wolverhampton: ["wolves", "wolverhampton wanderers"],
  "brighton hove albion": ["brighton", "brighton and hove albion"],
  "nottingham forest": ["notts forest", "forest"],
  "west ham united": ["west ham"],
  "newcastle united": ["newcastle"],
  "leeds united": ["leeds"],
  "real sociedad": ["sociedad", "la real"],
  "real betis": ["betis"],
  "athletic club": ["athletic bilbao", "athletic"],
  "celta vigo": ["celta", "rc celta de vigo"],
  "deportivo alaves": ["alaves"],
  "rayo vallecano": ["rayo"],
  "inter milan": ["internazionale", "inter"],
  "bayer leverkusen": ["leverkusen"],
  "borussia dortmund": ["dortmund", "bvb"],
  "sporting cp": ["sporting lisbon", "sporting"],
  "olympique marseille": ["marseille", "om"],
  ...INTERNATIONAL_ALIASES,
}

/** Competition names as providers write them. */
const COMPETITIONS: Record<string, string[]> = {
  "la liga": ["laliga", "liga", "primera division", "spanish league"],
  "champions league": ["ucl", "uefa champions league", "champions"],
  "premier league": ["epl", "premier", "english premier league"],
  "ligue 1": ["ligue1", "french league"],
  bundesliga: ["german league", "bundesliga 1"],
  ...INTERNATIONAL_COMPETITIONS,
}

/** Lower-case, de-accent, drop punctuation. */
function normalise(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

/** Significant tokens: normalised, with club filler removed. */
function tokens(s: string): string[] {
  return normalise(s).split(" ").filter((t) => t && !FILLER.has(t))
}

/**
 * One name-matcher over an alias table.
 *
 * Short aliases are the trap: "real" for Real Madrid also appears in Real
 * Sociedad and Real Betis, and "madrid" in Atlético Madrid. So a form is only
 * usable if its tokens are *not* a subset of some other canonical name in the
 * table — computed once here rather than pruned by hand every time a club is
 * added.
 */
function matcher(table: Record<string, string[]>) {
  const alias = new Map<string, string>()
  const canonTokens = new Map<string, Set<string>>()
  for (const [canon, names] of Object.entries(table)) {
    alias.set(normalise(canon), canon)
    for (const n of names) alias.set(normalise(n), canon)
    canonTokens.set(canon, new Set(tokens(canon)))
  }

  const ambiguous = (form: string, own: string) => {
    const t = tokens(form)
    if (!t.length) return true
    for (const [canon, set] of canonTokens) {
      if (canon === own) continue
      if (t.every((x) => set.has(x))) return true
    }
    return false
  }

  /** Alias-resolved canonical name, falling back to the stripped name. */
  const canonical = (name: string) =>
    alias.get(normalise(name)) ?? alias.get(tokens(name).join(" ")) ?? tokens(name).join(" ")

  /**
   * Does `name` appear in `haystack`? Every significant token of some
   * unambiguous form of the name must be present, so "Barcelona" finds
   * "FC Barcelona" and "Barça" alike while one shared token never counts.
   */
  return function nameIn(name: string, haystack: string): boolean {
    const canon = canonical(name)
    // Declared aliases plus every single token of the name itself, so
    // "Atletico" finds Atlético Madrid without a hand-written entry — both
    // run through the same ambiguity filter, which is why "Real" does not.
    // ponytail: ambiguity is judged against the clubs in ALIASES only, so a
    // club outside it could still collide; the both-teams gate plus the
    // kickoff score is what stops that mattering. Widen the table if it does.
    const candidates = [...(table[canon] ?? []), ...tokens(canon)]
    const forms = [canon, ...candidates.filter((f) => !ambiguous(f, canon))]
    const hay = ` ${haystack} `
    return forms.some((form) => {
      const parts = tokens(form)
      return parts.length > 0 && parts.every((t) => hay.includes(` ${t} `))
    })
  }
}

const teamIn = matcher(ALIASES)
const compIn = matcher(COMPETITIONS)

/** Kickoff instants within this window are treated as the same event. */
const KICKOFF_WINDOW_MS = 20 * 60 * 1000

export const DEFAULT_THRESHOLD = 0.7

export function threshold(): number {
  const raw = Number(process.env.PROVIDER_MATCH_THRESHOLD)
  return Number.isFinite(raw) && raw > 0 && raw <= 1 ? raw : DEFAULT_THRESHOLD
}

/**
 * Confidence that `candidate` is `fixture`, 0–1. Zero means "not this match":
 * both teams must be present before anything else is scored.
 *
 *   both teams      gate
 *   competition     +0.15
 *   kickoff ±20min  +0.25   (same day only: +0.10)
 */
export function score(fixture: Fixture, candidate: Candidate): number {
  const haystack = normalise(
    [candidate.title, candidate.home, candidate.away, candidate.competition]
      .filter(Boolean)
      .join(" "),
  )
  if (!haystack) return 0

  if (!teamIn(fixture.home, haystack)) return 0
  if (!teamIn(fixture.away, haystack)) return 0

  let s = 0.6
  if (compIn(fixture.league, haystack)) s += 0.15

  const ours = fixture.kickoff ? Date.parse(fixture.kickoff) : NaN
  const theirs = candidate.kickoff ? Date.parse(candidate.kickoff) : NaN
  if (Number.isFinite(ours) && Number.isFinite(theirs)) {
    if (Math.abs(ours - theirs) <= KICKOFF_WINDOW_MS) s += 0.25
    else if (new Date(ours).toISOString().slice(0, 10) === new Date(theirs).toISOString().slice(0, 10)) s += 0.1
  } else if (Number.isFinite(theirs)) {
    // No kickoff on our side — the day is all we can check.
    if (new Date(theirs).toISOString().slice(0, 10) === fixture.date) s += 0.1
  }

  return Math.min(s, 1)
}

/** Round to two places so the number is stable in a cached payload. */
export const round2 = (n: number) => Math.round(n * 100) / 100
