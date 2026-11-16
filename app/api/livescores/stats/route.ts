import { NextResponse } from "next/server"
import { resolveLiveScoreEvent } from "@/lib/livescores-resolver"

const STATS_API_BASE = "https://prod-public-api.livescore.com/v1/api/app/statistics/soccer"
const CACHE_TTL_MS = 15_000 // 15 seconds in-memory cache

type CacheEntry = {
  timestamp: number
  data: any
}

const statsCache = new Map<string, CacheEntry>()
const inflightStats = new Map<string, Promise<any>>()
// Persistent memory of last-known valid possession to prevent temporary 0-0 drops
const lastKnownPossession = new Map<string, { home: number; away: number }>()

export type LiveMatchStatsTeam = {
  possession: number
  xg: number
  shotsOnTarget: number
  shotsOffTarget: number
  blockedShots: number
  cornerKicks: number
  offsides: number
  fouls: number
  throwIns: number
  crosses: number
  goalKicks: number
  yellowCards: number
  redCards: number
  totalShots: number
}

export type LiveMatchStatsResponse = {
  eid: string
  hasStats: boolean
  home: LiveMatchStatsTeam
  away: LiveMatchStatsTeam
  shotsMap?: any
}

function parseTeamStat(s: any): LiveMatchStatsTeam {
  const shon = Number(s?.Shon) || 0
  const shof = Number(s?.Shof) || 0
  const shbl = Number(s?.Shbl) || 0

  const pssRaw = s?.Pss != null ? parseInt(String(s.Pss).replace(/[^0-9]/g, ""), 10) : NaN
  const pss = Number.isFinite(pssRaw) ? pssRaw : 0

  return {
    possession: pss,
    xg: typeof s?.Xg === "number" ? s.Xg : parseFloat(s?.Xg) || 0,
    shotsOnTarget: shon,
    shotsOffTarget: shof,
    blockedShots: shbl,
    cornerKicks: Number(s?.Cos) || 0,
    offsides: Number(s?.Ofs) || 0,
    fouls: Number(s?.Fls) || 0,
    throwIns: Number(s?.Ths) || 0,
    crosses: Number(s?.Crs) || 0,
    goalKicks: Number(s?.Gks) || 0,
    yellowCards: Number(s?.Ycs) || 0,
    redCards: Number(s?.Rcs) || 0,
    totalShots: shon + shof + shbl,
  }
}

async function fetchStatsForEid(eid: string): Promise<LiveMatchStatsResponse> {
  const cached = statsCache.get(eid)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data
  }

  const inflight = inflightStats.get(eid)
  if (inflight) return inflight

  const promise = (async () => {
    try {
      const res = await fetch(`${STATS_API_BASE}/${encodeURIComponent(eid)}`, {
        headers: {
          Accept: "application/json",
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(8_000),
      })

      if (!res.ok) {
        return {
          eid,
          hasStats: false,
          home: parseTeamStat(null),
          away: parseTeamStat(null),
        }
      }

      const json = await res.json()
      const rawStats = Array.isArray(json?.Stat) ? json.Stat : []
      const s1 = rawStats.find((s: any) => s.Tnb === 1) || rawStats[0] || null
      const s2 = rawStats.find((s: any) => s.Tnb === 2) || rawStats[1] || null

      const homeStat = parseTeamStat(s1)
      const awayStat = parseTeamStat(s2)

      // Fallback 1: Extract possession from PStat (period stats) if overall Stat is missing possession
      if (homeStat.possession === 0 || awayStat.possession === 0) {
        const pstats = Array.isArray(json?.PStat) ? json.PStat : []
        for (const pItem of pstats) {
          if (!pItem || typeof pItem !== "object") continue
          for (const period of ["2", "1", "3", "4"]) {
            const periodData = pItem[period]
            if (periodData && periodData.Pss != null) {
              const pVal = parseInt(String(periodData.Pss).replace(/[^0-9]/g, ""), 10)
              if (Number.isFinite(pVal) && pVal > 0) {
                if (periodData.Tnb === 1 && homeStat.possession === 0) {
                  homeStat.possession = pVal
                } else if (periodData.Tnb === 2 && awayStat.possession === 0) {
                  awayStat.possession = pVal
                }
              }
            }
          }
        }
      }

      // Fallback 2: Complementary extrapolation if only one team reported possession
      if (homeStat.possession > 0 && awayStat.possession === 0) {
        awayStat.possession = Math.max(0, 100 - homeStat.possession)
      } else if (awayStat.possession > 0 && homeStat.possession === 0) {
        homeStat.possession = Math.max(0, 100 - awayStat.possession)
      }

      // Fallback 3: Memory persistence if upstream temporarily zeroed out possession in an active match
      if (homeStat.possession === 0 && awayStat.possession === 0) {
        const lastPoss = lastKnownPossession.get(eid)
        if (lastPoss && lastPoss.home > 0 && lastPoss.away > 0) {
          homeStat.possession = lastPoss.home
          awayStat.possession = lastPoss.away
        }
      } else if (homeStat.possession > 0 && awayStat.possession > 0) {
        lastKnownPossession.set(eid, { home: homeStat.possession, away: awayStat.possession })
      }

      const result: LiveMatchStatsResponse = {
        eid,
        hasStats: rawStats.length > 0 || homeStat.possession > 0,
        home: homeStat,
        away: awayStat,
        shotsMap: json?.shotsMap ?? null,
      }

      statsCache.set(eid, { timestamp: Date.now(), data: result })
      return result
    } catch (err) {
      console.warn(`[livescores/stats] Failed fetching stats for eid ${eid}:`, err)
      return {
        eid,
        hasStats: false,
        home: parseTeamStat(null),
        away: parseTeamStat(null),
      }
    } finally {
      inflightStats.delete(eid)
    }
  })()

  inflightStats.set(eid, promise)
  return promise
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const eidParam = searchParams.get("eid")
  const fixtureIdParam = searchParams.get("fixture_id")

  // Stats need only the eid. Resolving via fixture_id costs a Supabase round
  // trip plus a walk over the day feed, so it is only done when the client
  // has nothing better; the live cards and watch page already hold the eid.
  const eid = eidParam?.trim() || (await resolveLiveScoreEvent(null, fixtureIdParam))?.eid
  if (!eid) {
    return NextResponse.json(
      { error: "Missing eid or active live match" },
      { status: 400, headers: { "Cache-Control": "public, s-maxage=30" } },
    )
  }

  const stats = await fetchStatsForEid(eid)

  // Every live card and the watch page poll this at 15s, so the CDN must
  // absorb those polls: same window as the in-memory TTL above.
  return NextResponse.json(stats, {
    headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=30" },
  })
}

