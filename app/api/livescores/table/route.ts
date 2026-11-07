import { NextResponse } from "next/server"
import { resolveLiveScoreEvent } from "@/lib/livescores-resolver"
import { normalizeTeam, sameTeams } from "@/lib/livescores"

const TABLE_API_BASE = "https://prod-public-api.livescore.com/v1/api/app/stage/soccer"
const CACHE_TTL_MS = 60_000

type CachedTable = {
  timestamp: number
  data: any
}

const tableCache = new Map<string, CachedTable>()

export type TableRow = {
  rank: number
  team: string
  teamId?: string
  played: number
  won: number
  drawn: number
  lost: number
  goalsFor: number
  goalsAgainst: number
  goalDiff: number
  points: number
  crest?: string
  isHome: boolean
  isAway: boolean
}

export type LeagueTableResponse = {
  leagueName: string
  homeTeam: string
  awayTeam: string
  rows: TableRow[]
}

function matchTeamName(target: string, candidate: string): boolean {
  if (!target || !candidate) return false
  const normTarget = normalizeTeam(target)
  const normCand = normalizeTeam(candidate)
  return normTarget === normCand || normCand.includes(normTarget) || normTarget.includes(normCand)
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const eidParam = searchParams.get("eid")
  const fixtureIdParam = searchParams.get("fixture_id")

  const matchEvent = await resolveLiveScoreEvent(eidParam, fixtureIdParam)
  if (!matchEvent?.eid) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 })
  }

  const { eid, home, away, countryCode, stageCode, stageName } = matchEvent
  const cacheKey = `${countryCode}/${stageCode}`

  const cached = tableCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return NextResponse.json(
      {
        ...cached.data,
        homeTeam: home,
        awayTeam: away,
        rows: cached.data.rows.map((r: TableRow) => ({
          ...r,
          isHome: matchTeamName(home, r.team),
          isAway: matchTeamName(away, r.team),
        })),
      },
      {
        headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
      },
    )
  }

  try {
    const res = await fetch(`${TABLE_API_BASE}/${encodeURIComponent(countryCode || "")}/${encodeURIComponent(stageCode || "")}/table`, {
      headers: {
        Accept: "application/json",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
      next: { revalidate: 60 },
    })

    if (!res.ok) {
      return NextResponse.json({
        leagueName: stageName || "League Table",
        homeTeam: home,
        awayTeam: away,
        rows: [],
      })
    }

    const json = await res.json()
    const stage = json?.Stages?.[0]
    const rawTable = stage?.LeagueTable?.L?.[0]?.Tables?.[0]?.team || []

    const rows: TableRow[] = rawTable.map((t: any) => ({
      rank: t.rnk || 0,
      team: t.Tnm || "Team",
      teamId: String(t.Tid || ""),
      played: t.pld || 0,
      won: t.win || 0,
      drawn: t.drw || 0,
      lost: t.lst || 0,
      goalsFor: t.gf || 0,
      goalsAgainst: t.ga || 0,
      goalDiff: t.gd || 0,
      points: t.pts || 0,
      crest: t.Img ? `https://static.livescore.com/c/football/teams/${t.Img}` : undefined,
      isHome: matchTeamName(home, t.Tnm),
      isAway: matchTeamName(away, t.Tnm),
    }))

    const result: LeagueTableResponse = {
      leagueName: stage?.Snm || stageName || "League Table",
      homeTeam: home,
      awayTeam: away,
      rows,
    }

    tableCache.set(cacheKey, { timestamp: Date.now(), data: result })

    return NextResponse.json(result, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
    })
  } catch (err) {
    console.error("[livescores/table] Error fetching table:", err)
    return NextResponse.json({ error: "Failed to fetch table" }, { status: 500 })
  }
}

