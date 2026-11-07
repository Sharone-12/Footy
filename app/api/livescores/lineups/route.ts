import { NextResponse } from "next/server"
import { resolveLiveScoreEvent } from "@/lib/livescores-resolver"
import { supabase } from "@/lib/supabase"

const LINEUPS_API_BASE = "https://prod-public-api.livescore.com/v1/api/app/lineups/soccer"
const CACHE_TTL_MS = 60_000

type CachedLineup = {
  timestamp: number
  data: any
}

const lineupsCache = new Map<string, CachedLineup>()

function normalizeName(s: string): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
}

export type LineupPlayer = {
  name: string
  shortName: string
  jerseyNumber: number | null
  position: number
  positionName: string
  row: number
  col: number
  totalInRow?: number
  playerId?: number | null
  imageUrl?: string
}

export type MatchLineupsResponse = {
  eid: string
  hasLineups: boolean
  homeFormation: string
  awayFormation: string
  homeStarting: LineupPlayer[]
  awayStarting: LineupPlayer[]
  homeSubs: LineupPlayer[]
  awaySubs: LineupPlayer[]
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const eidParam = searchParams.get("eid")
  const fixtureIdParam = searchParams.get("fixture_id")

  const matchEvent = await resolveLiveScoreEvent(eidParam, fixtureIdParam)
  if (!matchEvent?.eid) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 })
  }

  const { eid, home, away } = matchEvent

  const cached = lineupsCache.get(eid)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return NextResponse.json(cached.data, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
    })
  }

  try {
    const res = await fetch(`${LINEUPS_API_BASE}/${encodeURIComponent(eid)}`, {
      headers: {
        Accept: "application/json",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
      next: { revalidate: 60 },
    })

    if (!res.ok) {
      return NextResponse.json({
        eid,
        hasLineups: false,
        homeFormation: "",
        awayFormation: "",
        homeStarting: [],
        awayStarting: [],
        homeSubs: [],
        awaySubs: [],
      })
    }

    const raw = await res.json()
    const lu = Array.isArray(raw?.Lu) ? raw.Lu : []
    const homeTeamData = lu.find((t: any) => t.Tnb === 1) || lu[0]
    const awayTeamData = lu.find((t: any) => t.Tnb === 2) || lu[1]

    if (!homeTeamData && !awayTeamData) {
      return NextResponse.json({
        eid,
        hasLineups: false,
        homeFormation: "",
        awayFormation: "",
        homeStarting: [],
        awayStarting: [],
        homeSubs: [],
        awaySubs: [],
      })
    }

    // Fetch players from DB for both teams to map IDs
    const { data: dbPlayers } = await supabase
      .from("players")
      .select("player_id, player, team")
      .or(`team.ilike.%${home}%,team.ilike.%${away}%`)
      .limit(300)

    const findDbPlayerId = (playerName: string): number | null => {
      if (!dbPlayers || dbPlayers.length === 0) return null
      const target = normalizeName(playerName)
      if (!target) return null

      // Exact normalized match
      const exact = dbPlayers.find((p) => normalizeName(p.player) === target)
      if (exact) return exact.player_id

      // Surnames / substring match
      const partial = dbPlayers.find((p) => {
        const pNorm = normalizeName(p.player)
        return pNorm.includes(target) || target.includes(pNorm)
      })
      return partial ? partial.player_id : null
    }

    const parsePlayers = (
      teamData: any,
    ): { starting: LineupPlayer[]; subs: LineupPlayer[]; formation: string } => {
      if (!teamData) return { starting: [], subs: [], formation: "" }
      const ps = Array.isArray(teamData.Ps) ? teamData.Ps : []
      const formation = Array.isArray(teamData.Fo) ? teamData.Fo.join("-") : ""

      const starting: LineupPlayer[] = []
      const subs: LineupPlayer[] = []

      // Count players per row for spacing
      const rowCounts: Record<number, number> = {}

      for (const p of ps) {
        if (p.Pos === 10) continue // Skip coach
        const fullName = `${p.Fn || ""} ${p.Ln || ""}`.trim() || p.Snm || "Player"
        const short = p.Snm || (p.Ln ? `${p.Fn?.[0] ? `${p.Fn[0]}. ` : ""}${p.Ln}` : fullName)
        const fpParts = String(p.Fp || "1:1").split(":")
        const row = parseInt(fpParts[0], 10) || 1
        const col = parseInt(fpParts[1], 10) || 1

        const playerObj: LineupPlayer = {
          name: fullName,
          shortName: short,
          jerseyNumber: p.Snu ? Number(p.Snu) : null,
          position: p.Pos || 1,
          positionName: p.Pon || "Player",
          row,
          col,
          playerId: findDbPlayerId(fullName) || findDbPlayerId(p.Ln || ""),
          imageUrl: p.imageUrl ? `https://static.livescore.com/football/players/${p.imageUrl}` : undefined,
        }

        if (p.Pos === 5) {
          subs.push(playerObj)
        } else {
          starting.push(playerObj)
          rowCounts[row] = (rowCounts[row] || 0) + 1
        }
      }

      // Assign totalInRow
      for (const p of starting) {
        p.totalInRow = rowCounts[p.row] || 1
      }

      return { starting, subs, formation }
    }

    const homeParsed = parsePlayers(homeTeamData)
    const awayParsed = parsePlayers(awayTeamData)

    const result: MatchLineupsResponse = {
      eid,
      hasLineups: homeParsed.starting.length > 0 || awayParsed.starting.length > 0,
      homeFormation: homeParsed.formation,
      awayFormation: awayParsed.formation,
      homeStarting: homeParsed.starting,
      awayStarting: awayParsed.starting,
      homeSubs: homeParsed.subs,
      awaySubs: awayParsed.subs,
    }

    lineupsCache.set(eid, { timestamp: Date.now(), data: result })

    return NextResponse.json(result, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
    })
  } catch (err) {
    console.error("[livescores/lineups] Error fetching lineups:", err)
    return NextResponse.json({ error: "Failed to fetch lineups" }, { status: 500 })
  }
}

