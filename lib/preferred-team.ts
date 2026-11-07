/**
 * Which club the nav countdown follows.
 *
 * Browser-local on purpose: it is a display preference for one person on one
 * device, so it needs no table, no auth and no round trip. Absent means
 * Barça, which is what the layout already renders on the server — so the
 * default costs nothing and the pill only fetches when someone has chosen
 * otherwise.
 */

export type PreferredTeam = { id: number; name: string }

const KEY = "footyy:preferred-team"

/** Fired on write so an open pill updates without a reload. */
export const PREFERRED_TEAM_EVENT = "footyy:preferred-team-change"

/**
 * Null on the server, in private windows, and whenever the stored value is
 * not the shape we wrote — a bad entry should fall back to Barça, never
 * throw inside a layout that wraps every page.
 */
export function readPreferredTeam(): PreferredTeam | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as unknown
    if (
      typeof v === "object" &&
      v !== null &&
      typeof (v as PreferredTeam).id === "number" &&
      typeof (v as PreferredTeam).name === "string"
    ) {
      return { id: (v as PreferredTeam).id, name: (v as PreferredTeam).name }
    }
    return null
  } catch {
    return null
  }
}

/** Passing null clears the preference and returns the pill to Barça. */
export function writePreferredTeam(team: PreferredTeam | null): void {
  if (typeof window === "undefined") return
  try {
    if (team) window.localStorage.setItem(KEY, JSON.stringify(team))
    else window.localStorage.removeItem(KEY)
  } catch {
    // Private windows and blocked site data: the choice just doesn't persist.
  }
  window.dispatchEvent(new CustomEvent(PREFERRED_TEAM_EVENT))
}
