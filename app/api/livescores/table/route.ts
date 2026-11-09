import { NextResponse } from "next/server"
import { resolveLiveScoreEvent } from "@/lib/livescores-resolver"
import { normalizeTeam } from "@/lib/livescores"

const TABLE_API_BASE = "https://prod-public-api.livescore.com/v1/api/app/stage/soccer"
// Short cache during live games to provide real-time throughput
const CACHE_TTL_MS = 2_000

type CachedTable = {
  timestamp: number
  data: LeagueTableResponse
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
  isLive?: boolean
  phr?: number[]
  qualificationColor?: "blue" | "orange" | "green" | "red" | null
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

function getQualificationColor(
  phr?: number[],
  rank?: number,
  totalTeams?: number,
): "blue" | "orange" | "green" | "red" | null {
  if (phr && phr.length > 0) {
    if (phr.includes(20) || phr.includes(1)) return "blue"
    if (phr.includes(25) || phr.includes(2)) return "orange"
    if (phr.includes(191) || phr.includes(3)) return "green"
    if (phr.includes(15) || phr.includes(4)) return "red"
  }
  if (rank) {
    if (rank <= 4) return "blue"
    if (rank === 5) return "orange"
    if (rank === 6) return "green"
    if (totalTeams && rank > totalTeams - 3) return "red"
  }
  return null
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
        headers: { "Cache-Control": "public, s-maxage=20, stale-while-revalidate=60" },
      },
    )
  }

  try {
    const res = await fetch(
      `${TABLE_API_BASE}/${encodeURIComponent(countryCode || "")}/${encodeURIComponent(stageCode || "")}/table`,
      {
        headers: {
          Accept: "application/json",
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        },
        cache: "no-store",
      },
    )

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

    const rows: TableRow[] = rawTable.map((t: any, idx: number) => {
      const img = t.Img
      const crest = img
        ? img.startsWith("http")
          ? img
          : `https://storage.lsmedia1.com/images/team/medium/${img}`
        : undefined

      const isLive = t.Ipr === 1
      const phr = Array.isArray(t.phr) ? t.phr : undefined
      const rank = t.rnk ?? idx + 1
      const qualificationColor = getQualificationColor(phr, rank, rawTable.length)

      return {
        rank,
        team: t.Tnm || "Team",
        teamId: String(t.Tid || ""),
        played: t.pld ?? 0,
        won: t.win ?? 0,
        drawn: t.drw ?? 0,
        lost: t.lst ?? 0,
        goalsFor: t.gf ?? 0,
        goalsAgainst: t.ga ?? 0,
        goalDiff: t.gd ?? 0,
        points: t.pts ?? 0,
        crest,
        isLive,
        phr,
        qualificationColor,
        isHome: matchTeamName(home, t.Tnm),
        isAway: matchTeamName(away, t.Tnm),
      }
    })

    const result: LeagueTableResponse = {
      leagueName: stage?.Snm || stageName || "League Table",
      homeTeam: home,
      awayTeam: away,
      rows,
    }

    tableCache.set(cacheKey, { timestamp: Date.now(), data: result })

    return NextResponse.json(result, {
      headers: { "Cache-Control": "public, s-maxage=20, stale-while-revalidate=60" },
    })
  } catch (err) {
    console.error("[livescores/table] Error fetching table:", err)
    return NextResponse.json({ error: "Failed to fetch table" }, { status: 500 })
  }
}
