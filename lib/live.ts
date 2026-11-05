/**
 * Splitting fixtures into live / starting soon / upcoming.
 *
 * The scraper only ever writes `upcoming` or `finished` — there is no `live`
 * status — so "in play" is derived from the kickoff instant and a fixed
 * window, the same way the nav countdown decides a match is still on.
 */

/** A kickoff stays "in play" this long, so a match reads as live through it
 *  rather than disappearing at the whistle. */
export const PLAYING_MS = 2 * 60 * 60 * 1000

/** How far ahead of kickoff a fixture counts as starting soon. */
export const SOON_MS = 3 * 60 * 60 * 1000

/** The timing fields every fixture row carries. */
export type Timed = { kickoff: string | null; date: string }

/**
 * When a fixture starts, in epoch ms. Without a kickoff time all we know is
 * the day, so it counts from the end of it — that keeps a date-only fixture
 * out of "live" instead of treating midnight as kickoff.
 */
export const startOf = (m: Timed) =>
  new Date(m.kickoff ?? `${m.date}T23:59:59Z`).getTime()

export type Buckets<T> = { live: T[]; soon: T[]; upcoming: T[] }

/**
 * Bucket fixtures against `now`. A fixture lands in exactly one bucket, and
 * anything already past its playing window is dropped — the scraper will flip
 * it to `finished` on the next refresh.
 */
export function splitFixtures<T extends Timed>(rows: T[], now: number): Buckets<T> {
  const out: Buckets<T> = { live: [], soon: [], upcoming: [] }
  for (const row of rows) {
    const start = startOf(row)
    if (Number.isNaN(start)) continue
    const left = start - now
    if (left <= 0) {
      if (now - start < PLAYING_MS) out.live.push(row)
    } else if (left <= SOON_MS) {
      out.soon.push(row)
    } else {
      out.upcoming.push(row)
    }
  }
  for (const key of ["live", "soon", "upcoming"] as const) {
    out[key].sort((a, b) => startOf(a) - startOf(b))
  }
  return out
}
