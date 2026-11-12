import { fetchDaySnapshot, findLive, type FixtureLike, type LiveScore } from "./livescores.ts"
import { supabase } from "./supabase.ts"

export type ResolvedMatchEvent = {
  eid: string
  home: string
  away: string
  homeId?: number | null
  awayId?: number | null
  league?: string
  date?: string
  countryCode?: string
  stageCode?: string
  stageName?: string
}

const SCOREBOARD_API = "https://prod-public-api.livescore.com/v1/api/app/scoreboard/soccer"
const scoreboardCache = new Map<string, { timestamp: number; data: any }>()
const CACHE_TTL_MS = 2_000

export async function fetchScoreboard(eid: string): Promise<any | null> {
  const cached = scoreboardCache.get(eid)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data
  }

  try {
    const res = await fetch(`${SCOREBOARD_API}/${encodeURIComponent(eid)}`, {
      headers: {
        Accept: "application/json",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
      cache: "no-store",
    })

    if (!res.ok) return null
    const json = await res.json()
    scoreboardCache.set(eid, { timestamp: Date.now(), data: json })
    return json
  } catch (err) {
    console.warn(`[livescores-resolver] Failed fetching scoreboard for eid ${eid}:`, err)
    return null
  }
}

/**
 * Resolve fixture parameters to a LiveScore eid and match details.
 *
 * Memoised because every match-centre tab calls it: the lineups, table and
 * h2h routes each paid a Supabase round trip plus a name match against the
 * day feed for the same fixture, one after another, as you clicked through.
 * Resolution is pure lookup, so one answer serves all of them.
 */
const RESOLVE_TTL_MS = 60_000
const resolved = new Map<string, { at: number; data: ResolvedMatchEvent | null }>()
const resolveInflight = new Map<string, Promise<ResolvedMatchEvent | null>>()

export async function resolveLiveScoreEvent(
  eidParam?: string | null,
  fixtureIdParam?: string | null,
): Promise<ResolvedMatchEvent | null> {
  const key = `${eidParam ?? ""}|${fixtureIdParam ?? ""}`

  const hit = resolved.get(key)
  if (hit && Date.now() - hit.at < RESOLVE_TTL_MS) return hit.data

  const pending = resolveInflight.get(key)
  if (pending) return pending

  const task = (async () => {
    try {
      const data = await resolveUncached(eidParam, fixtureIdParam)
      // Only a successful resolve is worth remembering: a miss is usually a
      // fixture the feed has not published yet, and will resolve shortly.
      if (data?.eid) resolved.set(key, { at: Date.now(), data })
      return data
    } finally {
      resolveInflight.delete(key)
    }
  })()
  resolveInflight.set(key, task)
  return task
}

async function resolveUncached(
  eidParam?: string | null,
  fixtureIdParam?: string | null,
): Promise<ResolvedMatchEvent | null> {
  let eid = eidParam?.trim() || null
  let home = ""
  let away = ""
  let homeId: number | null = null
  let awayId: number | null = null
  let league = ""
  let date = ""

  // 1. If fixtureId provided, load fixture row from Supabase
  if (fixtureIdParam) {
    const { data: fixtureRow } = await supabase
      .from("matches")
      .select("event_id, home, home_id, away, away_id, date, kickoff, league")
      .eq("event_id", Number(fixtureIdParam))
      .maybeSingle()

    if (fixtureRow) {
      home = fixtureRow.home || ""
      away = fixtureRow.away || ""
      homeId = fixtureRow.home_id ?? null
      awayId = fixtureRow.away_id ?? null
      league = fixtureRow.league || ""
      date = fixtureRow.date || ""

      // Find eid in target date snapshot if not given directly
      if (!eid) {
        try {
          const targetDate = fixtureRow.date ? new Date(`${fixtureRow.date}T12:00:00Z`) : undefined
          let snapshot = await fetchDaySnapshot(targetDate)
          let allScores = snapshot.all && snapshot.all.length > 0 ? snapshot.all : snapshot.live
          let matched = findLive(fixtureRow as FixtureLike, allScores)

          // Fallback to today's snapshot (covers timezone offsets / matches crossing UTC midnight)
          if (!matched?.id && targetDate) {
            const todaySnapshot = await fetchDaySnapshot()
            const todayScores = todaySnapshot.all && todaySnapshot.all.length > 0 ? todaySnapshot.all : todaySnapshot.live
            matched = findLive(fixtureRow as FixtureLike, todayScores)
          }

          if (matched?.id) {
            eid = matched.id
          }
        } catch {
          // ignore error
        }
      }
    } else {
      // If not in database, fixtureIdParam might be a direct LiveScore eid
      try {
        const directSb = await fetchScoreboard(fixtureIdParam)
        if (directSb?.T1?.[0]?.Nm) {
          eid = fixtureIdParam
        }
      } catch {
        // ignore error
      }
    }
  }

  if (!eid) return null

  // 2. Fetch scoreboard metadata for stage & country info
  const sb = await fetchScoreboard(eid)
  const stg = sb?.Stg

  const esdStr = sb?.Esd ? String(sb.Esd) : ""
  const formattedDate =
    date ||
    (esdStr.length >= 8
      ? `${esdStr.slice(0, 4)}-${esdStr.slice(4, 6)}-${esdStr.slice(6, 8)}`
      : "")

  return {
    eid,
    home: home || sb?.T1?.[0]?.Nm || "Home",
    away: away || sb?.T2?.[0]?.Nm || "Away",
    homeId,
    awayId,
    league: league || stg?.Sdn || stg?.Snm || stg?.Cnm || "Football",
    date: formattedDate,
    countryCode: stg?.Ccd || stg?.CnmT || "international",
    stageCode: stg?.Scd || stg?.CompUrlName || "",
    stageName: stg?.Sdn || stg?.Snm || "",
  }
}

