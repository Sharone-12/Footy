/**
 * Live scores and a running match clock.
 *
 * `lib/live.ts` can only *guess* at in-play state, because the scraper writes
 * `upcoming` or `finished` and nothing else — a fixture reads as live for a
 * fixed two hours after kickoff, with no minute and no score. This module
 * fills that gap from a live feed.
 *
 * The clock is the point. The feed refreshes each match's clock only every
 * 30-130s, so rendering its minute string straight through gives a scoreboard
 * that lurches. `matchClock` extrapolates locally from a reference instant
 * instead, which lets the UI tick every second and resync on each poll.
 */

import { teamSimilarity } from "@/lib/streamfree/matcher"

const FEED = "https://prod-cdn-mev-api.livescore.com/v1/api/app/date/soccer"

/** Statuses that are not a running match: no clock, nothing to extrapolate. */
export const NOT_IN_PLAY = new Set([
  "NS", "FT", "Postp", "Canc", "AET", "AP", "Abd", "Susp", "",
])

/** A clock reference: `elapsedMs` of match time as measured at `atMs`. */
export type LiveClock = { elapsedMs: number; atMs: number }

export type LiveScore = {
  id: string
  league: string
  home: string
  away: string
  homeGoals: number | null
  awayGoals: number | null
  /** The feed's own label — "28'", "HT", "FT". The fallback when no clock. */
  status: string
  /** 1 = first half, 2 = second, and so on. */
  period: number | null
  /** Absent whenever the clock is stopped, which is how a break is detected. */
  clock: LiveClock | null
  /** Kickoff, epoch ms, from the feed's `YYYYMMDDHHMMSS`. */
  kickoffMs: number | null
}

const int = (v: unknown): number | null => {
  const n = typeof v === "string" ? parseInt(v, 10) : typeof v === "number" ? v : NaN
  return Number.isFinite(n) ? n : null
}

/** `20261107120000` -> epoch ms. */
export function parseEsd(esd: unknown): number | null {
  const s = String(esd ?? "")
  if (!/^\d{14}$/.test(s)) return null
  const t = Date.UTC(
    +s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8),
    +s.slice(8, 10), +s.slice(10, 12), +s.slice(12, 14),
  )
  return Number.isFinite(t) ? t : null
}

/** Pull the in-play matches out of a feed payload. */
export function normalizeLive(payload: unknown): LiveScore[] {
  const stages = (payload as { Stages?: unknown[] })?.Stages
  if (!Array.isArray(stages)) return []

  const out: LiveScore[] = []
  for (const stage of stages) {
    const s = stage as Record<string, unknown>
    const league = String(s.Cnm ?? s.CompN ?? "")
    for (const raw of (Array.isArray(s.Events) ? s.Events : [])) {
      const e = raw as Record<string, unknown>
      const status = String(e.Eps ?? "")
      if (NOT_IN_PLAY.has(status)) continue

      const etm = e.Etm as { ATm?: unknown; RTm?: unknown } | undefined
      const atMs = int(etm?.ATm)
      const elapsedMs = int(etm?.RTm)

      out.push({
        id: String(e.Eid ?? ""),
        league,
        home: String((e.T1 as { Nm?: string }[] | undefined)?.[0]?.Nm ?? ""),
        away: String((e.T2 as { Nm?: string }[] | undefined)?.[0]?.Nm ?? ""),
        homeGoals: int(e.Tr1),
        awayGoals: int(e.Tr2),
        status,
        period: int(e.Epr),
        // Both halves of the reference are required; one without the other
        // cannot be extrapolated from.
        clock: atMs !== null && elapsedMs !== null ? { elapsedMs, atMs } : null,
        kickoffMs: parseEsd(e.Esd),
      })
    }
  }
  return out
}

export type ClockReading = {
  /** Displayed minute, or null when the clock is stopped. */
  minute: number | null
  /** What to render: "28'", "45+", "HT". */
  display: string
  /** Whether this should tick on its own. */
  running: boolean
}

/**
 * Period boundaries a displayed minute cannot cross.
 *
 * Derived from the feed's own minute, never from `Epr`: against the live feed
 * `Epr` was 1 for matches in the 71st and 86th minute, so treating it as the
 * half number capped two thirds of all running matches at "45+".
 */
const BOUNDARIES = [45, 90, 105, 120]

const boundaryFor = (minute: number) =>
  BOUNDARIES.find((b) => minute <= b) ?? 120

/**
 * The minute the feed itself is displaying, and whether it is added time.
 *
 * "28'" -> 28, "45+" / "90+2'" -> added time, "HT" / "BT" -> null (not
 * counting). Added time is never extrapolated through, because the feed does
 * not say how long it runs.
 */
export function parseStatusMinute(
  status: string,
): { minute: number; added: boolean } | null {
  const m = /^(\d{1,3})\s*(\+)/.exec(status)
  if (m) return { minute: parseInt(m[1], 10), added: true }
  const plain = /^(\d{1,3})'?$/.exec(status.trim())
  return plain ? { minute: parseInt(plain[1], 10), added: false } : null
}

/**
 * How old a clock reference may be before it is no longer extrapolated from.
 *
 * Measured against the live feed, healthy references were 4-78s old while
 * drifting ones were 138s and older, so the line sits just above the healthy
 * band. When a period ends the
 * clock stops but the reference keeps ageing, so extrapolation drifts ahead of
 * reality — a match displaying 2' computed as 4'. That drift stays inside the
 * period, so only staleness catches it. Past this age the feed's own label is
 * trusted instead.
 */
export const STALE_REFERENCE_MS = 120_000

/**
 * Read the clock at `now`.
 *
 * With no clock reference, or a stale one, the match is not counting up and
 * the feed's own label is the truth. With a fresh one the minute is
 * extrapolated, and capped at the period boundary: added time shows as "45+"
 * rather than guessed at, because the feed never says how much there is.
 */
export function matchClock(score: LiveScore, now: number): ClockReading {
  const stale = score.clock && now - score.clock.atMs > STALE_REFERENCE_MS
  if (!score.clock || stale) {
    return { minute: null, display: score.status || "LIVE", running: false }
  }

  const shown = parseStatusMinute(score.status)
  // "45+2'" and the like: show exactly what the feed shows.
  if (!shown || shown.added) {
    return { minute: shown?.minute ?? null, display: score.status, running: false }
  }

  const elapsed = score.clock.elapsedMs + (now - score.clock.atMs)
  const ticked = Math.max(1, Math.floor(elapsed / 60_000) + 1)
  // Never behind the feed, never across the boundary its minute sits in.
  const boundary = boundaryFor(shown.minute)
  const minute = Math.max(shown.minute, Math.min(ticked, boundary))
  if (ticked > boundary) {
    return { minute: boundary, display: `${boundary}+`, running: true }
  }
  return { minute, display: `${minute}'`, running: true }
}

/* ── Matching a feed row to one of our fixtures ──────────────────────────── */

/** Club-type tokens that differ between sources: "Liverpool FC" vs "Liverpool". */
const NOISE_TOKENS = new Set([
  "fc", "cf", "afc", "sc", "ac", "as", "ss", "sv", "sk", "bk", "if", "ff",
  "vfl", "vfb", "bsc", "tsg", "rc", "ud", "cd", "sd", "ca", "club", "cp",
  "de", "fk", "nk", "hk", "ik", "aik", "us", "usl", "calcio", "futbol",
])

/**
 * Reduce a club name to comparable tokens.
 *
 * Diacritics go ("FC Bayern München" vs "Bayern Munchen"), club-type tokens
 * go, and what remains is sorted so word order cannot break a match.
 */
export function normalizeTeam(name: string): string {
  const words = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !NOISE_TOKENS.has(w))
  const kept = words.length ? words : name.toLowerCase().split(/\s+/)
  return kept.sort().join(" ")
}

/** Same fixture? Both sides must agree, which is what stops a mispair. */
export function sameTeams(
  a: { home: string; away: string },
  b: { home: string; away: string },
): boolean {
  if (
    normalizeTeam(a.home) === normalizeTeam(b.home) &&
    normalizeTeam(a.away) === normalizeTeam(b.away)
  ) {
    return true
  }

  // Alias and token similarity fallback (handles e.g. "Real Racing Club" <-> "Racing Santander")
  const homeSim = teamSimilarity(a.home, b.home)
  const awaySim = teamSimilarity(a.away, b.away)
  return homeSim >= 0.75 && awaySim >= 0.75
}

export type FixtureLike = { home: string; away: string; kickoff?: string | null; date: string }

/** How far a feed kickoff may sit from ours and still be the same match. */
const KICKOFF_EXACT_SLACK_MS = 12 * 3600_000
const KICKOFF_DATE_ONLY_SLACK_MS = 26 * 3600_000

/**
 * Find the live row for a fixture, or null.
 *
 * Both team names must match *and* the kickoff must line up. Requiring both
 * is deliberate: "Newcastle United" and "Newcastle Jets" normalize apart, but
 * single-name clubs across different countries do collide, and a scoreboard
 * showing the wrong match is worse than showing none.
 */
export function findLive(fixture: FixtureLike, scores: LiveScore[]): LiveScore | null {
  const hasKickoff = Boolean(fixture.kickoff)
  const ourStart = Date.parse(fixture.kickoff ?? `${fixture.date}T12:00:00Z`)
  const slack = hasKickoff ? KICKOFF_EXACT_SLACK_MS : KICKOFF_DATE_ONLY_SLACK_MS
  for (const score of scores) {
    if (!sameTeams(fixture, score)) continue
    if (score.kickoffMs !== null && Number.isFinite(ourStart)) {
      if (Math.abs(score.kickoffMs - ourStart) > slack) continue
    }
    return score
  }
  return null
}

/* ── Fetching ────────────────────────────────────────────────────────────── */

export const feedUrl = (date: Date = new Date()) =>
  `${FEED}/${date.toISOString().slice(0, 10).replace(/-/g, "")}/0`

/**
 * Fetch and normalize one day of live scores.
 *
 * Caller caches; this always goes upstream. The payload is ~420 KB of the
 * whole day's fixtures (gzip brings it to ~80 KB) to yield roughly thirty
 * in-play rows, so it must never be fetched per request.
 */
export async function fetchLiveScores(date?: Date): Promise<LiveScore[]> {
  const response = await fetch(feedUrl(date), {
    headers: { Accept: "application/json" },
    cache: "no-store",
  })
  if (!response.ok) throw new Error(`live feed ${response.status}`)
  return normalizeLive(await response.json())
}
