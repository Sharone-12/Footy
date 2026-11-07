/**
 * Write a final scoreline as soon as the live feed says full time.
 *
 * The scraper is still the authority and still fetches every scoreline on its
 * own schedule — this only closes the gap in between. With runs at 23:00 and
 * 08:00 a match that ends at 02:00 waits six hours before the site shows its
 * result; the feed behind /api/livescores already carries that result within
 * seconds, in the same payload we fetch for the clock and then discard.
 *
 * Deliberately narrower than `findLive`:
 *
 * - `findLive` falls back to `teamSimilarity >= 0.75` because a missing
 *   scoreboard is worse than a fuzzy one, and a wrong guess is erased by the
 *   next poll. A write is not erased. So the names must normalize equal, on
 *   both sides, with no similarity fallback.
 * - Exactly one feed row may match. Two means we cannot tell them apart, and
 *   a wrong stored result is worse than a late one.
 * - Only rows still marked `upcoming` are touched, so a score already on the
 *   record is never overwritten.
 *
 * Anything this declines to settle is picked up by the next scraper run,
 * which overwrites whatever is here regardless.
 */

// Relative, with the extension, rather than the usual "@/lib/..." alias: that
// alias is what stops lib/livescores.test.ts running under plain node, and the
// rules below are worth being able to test.
import { normalizeTeam, type LiveScore } from "../livescores.ts"

export type OurMatch = {
  event_id: number
  date: string
  kickoff: string | null
  home: string
  away: string
}

export type Settlement = {
  event_id: number
  home_goals: number
  away_goals: number
}

/**
 * How long after kickoff a full-time row is believed.
 *
 * 100 minutes clears 90 plus stoppage, so a feed row reading FT before then
 * belongs to some other match and must not be matched to this one.
 */
export const MIN_AGE_MS = 100 * 60_000

/**
 * How far the feed's kickoff may sit from ours and still be the same match.
 *
 * Wide enough for a delayed start, far short of the week or more between the
 * legs of a tie, which is the one case where the same two clubs meet twice.
 */
export const KICKOFF_SLACK_MS = 6 * 3_600_000

/** How far back to look for fixtures that are still open. */
export const LOOKBACK_MS = 36 * 3_600_000

/**
 * Which of our open fixtures the feed has unambiguously finished.
 *
 * Pure, so the rules above can be tested without a database.
 */
export function pickSettlements(
  ours: OurMatch[],
  finals: LiveScore[],
  now: number,
): Settlement[] {
  const out: Settlement[] = []

  for (const m of ours) {
    // No exact kickoff means no safe window to match within, so the scraper
    // can have it. `kickoff` is a newer column and is null on older rows.
    if (!m.kickoff) continue
    const started = Date.parse(m.kickoff)
    if (!Number.isFinite(started)) continue
    if (now - started < MIN_AGE_MS) continue

    const home = normalizeTeam(m.home)
    const away = normalizeTeam(m.away)
    const hits = finals.filter(
      (f) =>
        f.homeGoals != null &&
        f.awayGoals != null &&
        f.kickoffMs != null &&
        Math.abs(f.kickoffMs - started) <= KICKOFF_SLACK_MS &&
        normalizeTeam(f.home) === home &&
        normalizeTeam(f.away) === away,
    )
    if (hits.length !== 1) continue

    out.push({
      event_id: m.event_id,
      home_goals: hits[0].homeGoals as number,
      away_goals: hits[0].awayGoals as number,
    })
  }

  return out
}

/** `YYYY-MM-DD`, matching the `date` column. */
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/**
 * Settle what can be settled; returns how many rows were written.
 *
 * The Supabase clients are imported lazily so the rules above can be unit
 * tested under plain node, where neither client can be constructed.
 */
export async function settleFinished(
  finals: LiveScore[],
  now: number = Date.now(),
): Promise<number> {
  if (finals.length === 0) return 0

  const [{ supabase }, { supabaseAdmin }] = await Promise.all([
    import("@/lib/supabase"),
    import("@/lib/supabase-admin"),
  ])

  const { data, error } = await supabase
    .from("matches")
    .select("event_id, date, kickoff, home, away")
    .eq("status", "upcoming")
    .gte("date", day(now - LOOKBACK_MS))
    .lte("date", day(now + 3_600_000))
  if (error || !data?.length) return 0

  const picks = pickSettlements(data as unknown as OurMatch[], finals, now)

  let written = 0
  for (const p of picks) {
    // The status filter is the race guard: if the scraper or another instance
    // settled this first, the update matches nothing and we leave it alone.
    const { error: writeError } = await supabaseAdmin
      .from("matches")
      .update({
        home_goals: p.home_goals,
        away_goals: p.away_goals,
        status: "finished",
      })
      .eq("event_id", p.event_id)
      .eq("status", "upcoming")
    if (!writeError) written++
  }
  return written
}
