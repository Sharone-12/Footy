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
  const shon = s?.Shon ?? 0
  const shof = s?.Shof ?? 0
  const shbl = s?.Shbl ?? 0

  return {
    possession: s?.Pss ?? 0,
    xg: typeof s?.Xg === "number" ? s.Xg : parseFloat(s?.Xg) || 0,
    shotsOnTarget: shon,
    shotsOffTarget: shof,
    blockedShots: shbl,
    cornerKicks: s?.Cos ?? 0,
    offsides: s?.Ofs ?? 0,
    fouls: s?.Fls ?? 0,
    throwIns: s?.Ths ?? 0,
    crosses: s?.Crs ?? 0,
    goalKicks: s?.Gks ?? 0,
    yellowCards: s?.Ycs ?? 0,
    redCards: s?.Rcs ?? 0,
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

      const result: LiveMatchStatsResponse = {
        eid,
        hasStats: rawStats.length > 0,
        home: parseTeamStat(s1),
        away: parseTeamStat(s2),
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

  const matchEvent = await resolveLiveScoreEvent(eidParam, fixtureIdParam)
  if (!matchEvent?.eid) {
    return NextResponse.json(
      { error: "Missing eid or active live match" },
      { status: 400 },
    )
  }

  const stats = await fetchStatsForEid(matchEvent.eid)

  return NextResponse.json(stats, {
    headers: {
      "Cache-Control": "public, s-maxage=15, stale-while-revalidate=30",
    },
  })
}

