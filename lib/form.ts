/**
 * Recent form from the `matches` table.
 *
 * Results only — no new ingestion. A match counts as played when both goal
 * columns are present; the loader leaves them null until it has a score, so
 * a postponed or in-progress fixture never lands in the form run.
 */

export type Played = {
  date: string
  home_id: number | null
  away_id: number | null
  home_goals: number | null
  away_goals: number | null
}

export type Outcome = "W" | "D" | "L"

export type Form = {
  /** Oldest to newest, the way a form guide reads left to right. */
  results: Outcome[]
  /** Goals for and against across those results. */
  gf: number
  ga: number
  /** The current run, counted back from the most recent result. */
  streak: { type: Outcome; count: number } | null
}

/** One match from `teamId`'s point of view, or null if it wasn't played. */
export function outcomeFor(m: Played, teamId: number): Outcome | null {
  if (m.home_goals == null || m.away_goals == null) return null
  const home = m.home_id === teamId
  if (!home && m.away_id !== teamId) return null
  const [ours, theirs] = home
    ? [m.home_goals, m.away_goals]
    : [m.away_goals, m.home_goals]
  return ours > theirs ? "W" : ours < theirs ? "L" : "D"
}

/** Goals for/against in one match, or null if it wasn't played. */
function goalsFor(m: Played, teamId: number): [number, number] | null {
  if (m.home_goals == null || m.away_goals == null) return null
  if (m.home_id === teamId) return [m.home_goals, m.away_goals]
  if (m.away_id === teamId) return [m.away_goals, m.home_goals]
  return null
}

/**
 * The last `limit` played matches, newest-first input or not — rows are
 * sorted by date here so the caller's query order can't change the answer.
 */
export function summarise(rows: Played[], teamId: number, limit = 5): Form {
  const played = rows
    .filter((m) => outcomeFor(m, teamId) != null)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-limit)

  const results = played.map((m) => outcomeFor(m, teamId)!)

  let gf = 0
  let ga = 0
  for (const m of played) {
    const g = goalsFor(m, teamId)
    if (g) {
      gf += g[0]
      ga += g[1]
    }
  }

  let streak: Form["streak"] = null
  if (results.length) {
    const type = results[results.length - 1]
    let count = 0
    for (let i = results.length - 1; i >= 0 && results[i] === type; i--) count++
    streak = { type, count }
  }

  return { results, gf, ga, streak }
}

/** "3-game winning run", "unbeaten in 4" — null when there's nothing to say. */
export function streakLabel(form: Form): string | null {
  const s = form.streak
  if (!s || s.count < 2) return null
  if (s.type === "W") return `${s.count}-game winning run`
  if (s.type === "L") return `Lost ${s.count} in a row`
  return `${s.count} straight draws`
}
