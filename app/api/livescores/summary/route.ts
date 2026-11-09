import { NextResponse } from "next/server"
import { resolveLiveScoreEvent, fetchScoreboard } from "@/lib/livescores-resolver"

const INCIDENTS_API = "https://prod-public-api.livescore.com/v1/api/app/incidents/soccer"
const INFO_API = "https://prod-public-api.livescore.com/v1/api/app/info/soccer"
const CACHE_TTL_MS = 2_000

type CachedSummary = {
  timestamp: number
  data: MatchSummaryResponse
}

const summaryCache = new Map<string, CachedSummary>()
const inflightSummary = new Map<string, Promise<MatchSummaryResponse>>()

export type MatchIncident = {
  id: string
  min: number
  minEx?: number | null
  minDisplay: string
  half: number
  team: "home" | "away"
  type:
    | "goal"
    | "penalty"
    | "own-goal"
    | "yellow-card"
    | "second-yellow"
    | "red-card"
    | "disallowed-goal"
  player: string
  playerNum?: number | null
  assist?: string | null
  score?: [number, number] | null
  varReason?: string | null
}

export type MatchInfoData = {
  venue?: {
    name: string
    city?: string | null
    capacity?: number | null
    country?: string | null
  } | null
  referee?: {
    name: string
    country?: string | null
  } | null
  competition?: string | null
  stage?: string | null
  round?: string | null
  startTime?: string | null
  status?: string | null
  scores?: {
    ht?: [number, number] | null
    ft?: [number, number] | null
  }
}

export type MatchSummaryResponse = {
  eid: string
  home: string
  away: string
  status: string
  scores: {
    ht: [number, number] | null
    ft: [number, number] | null
  }
  matchInfo: MatchInfoData
  incidents: MatchIncident[]
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const eidParam = searchParams.get("eid")
  const fixtureIdParam = searchParams.get("fixture_id")

  const matchEvent = await resolveLiveScoreEvent(eidParam, fixtureIdParam)
  if (!matchEvent?.eid) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 })
  }

  const { eid, home, away, stageName } = matchEvent

  const cached = summaryCache.get(eid)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return NextResponse.json(cached.data, {
      headers: { "Cache-Control": "public, s-maxage=10, stale-while-revalidate=20" },
    })
  }

  const pending = inflightSummary.get(eid)
  if (pending) {
    const data = await pending
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, s-maxage=10, stale-while-revalidate=20" },
    })
  }

  try {
    const [incidentsRes, infoRes, scoreboard] = await Promise.all([
      fetch(`${INCIDENTS_API}/${encodeURIComponent(eid)}`, {
        headers: {
          Accept: "application/json",
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        },
        cache: "no-store",
      }).catch(() => null),
      fetch(`${INFO_API}/${encodeURIComponent(eid)}`, {
        headers: {
          Accept: "application/json",
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        },
        cache: "no-store",
      }).catch(() => null),
      fetchScoreboard(eid),
    ])

    const incidentsJson = incidentsRes && incidentsRes.ok ? await incidentsRes.json() : null
    const infoJson = infoRes && infoRes.ok ? await infoRes.json() : null

    // Parse Halftime and Fulltime scores
    const htScore: [number, number] | null =
      scoreboard?.Trh1 !== undefined && scoreboard?.Trh2 !== undefined
        ? [Number(scoreboard.Trh1), Number(scoreboard.Trh2)]
        : incidentsJson?.Trh1 !== undefined && incidentsJson?.Trh2 !== undefined
          ? [Number(incidentsJson.Trh1), Number(incidentsJson.Trh2)]
          : null

    const ftScore: [number, number] | null =
      scoreboard?.Tr1 !== undefined && scoreboard?.Tr2 !== undefined
        ? [Number(scoreboard.Tr1), Number(scoreboard.Tr2)]
        : incidentsJson?.Tr1 !== undefined && incidentsJson?.Tr2 !== undefined
          ? [Number(incidentsJson.Tr1), Number(incidentsJson.Tr2)]
          : null

    // Parse venue & referee from infoJson or scoreboard
    const venueName = infoJson?.Vnm || scoreboard?.Venue?.Vnm || null
    const venueCity = infoJson?.Vcy || scoreboard?.Venue?.Vcy || null
    const venueCap = infoJson?.Vsp || scoreboard?.Venue?.Vsp || null
    const venueCountry = infoJson?.VCnm || null

    const primaryRef = infoJson?.Refs?.[0]
    const refName = primaryRef?.Nm || null
    const refCountry = primaryRef?.Cn || null

    const matchInfo: MatchInfoData = {
      venue: venueName
        ? {
            name: venueName,
            city: venueCity,
            capacity: venueCap ? Number(venueCap) : null,
            country: venueCountry,
          }
        : null,
      referee: refName
        ? {
            name: refName,
            country: refCountry,
          }
        : null,
      competition: scoreboard?.Stg?.CompN || scoreboard?.Stg?.Snm || stageName || null,
      stage: scoreboard?.Stg?.Sdn || scoreboard?.Stg?.Snm || null,
      round: scoreboard?.ErnInf || null,
      status: scoreboard?.Eps || incidentsJson?.Eps || "Scheduled",
      scores: {
        ht: htScore,
        ft: ftScore,
      },
    }

    // Parse incidents
    const incidents: MatchIncident[] = []
    const incsByHalf = incidentsJson?.Incs || {}

    for (const halfKey of ["1", "2", "3", "4", "5"]) {
      const rawItems = incsByHalf[halfKey]
      if (!Array.isArray(rawItems)) continue

      for (let i = 0; i < rawItems.length; i++) {
        const item = rawItems[i]
        const minVal = Number(item.Min ?? 0)
        const minEx = item.MinEx !== undefined ? Number(item.MinEx) : null
        const minDisplay = minEx !== null ? `${minVal}+${minEx}'` : `${minVal}'`
        const team: "home" | "away" = item.Nm === 1 ? "home" : "away"

        const subIncs = item.Incs
        if (Array.isArray(subIncs) && subIncs.length > 0) {
          // Composite incident (typically goal + assist or VAR goal)
          const mainIt =
            subIncs.find((s: any) => [36, 37, 39, 62].includes(s.IT)) || subIncs[0]
          const assistIt = subIncs.find((s: any) => s.IT === 63)

          const code = mainIt?.IT
          const tType: MatchIncident["type"] =
            code === 37
              ? "penalty"
              : code === 39
                ? "own-goal"
                : code === 62
                  ? "disallowed-goal"
                  : "goal"

          const playerName =
            mainIt?.Pn ||
            `${mainIt?.Fn || ""} ${mainIt?.Ln || ""}`.trim() ||
            "Player"

          const assistName = assistIt
            ? assistIt.Pn || `${assistIt.Fn || ""} ${assistIt.Ln || ""}`.trim() || null
            : null

          incidents.push({
            id: `${eid}-${halfKey}-${minVal}-${i}`,
            min: minVal,
            minEx,
            minDisplay,
            half: Number(halfKey),
            team,
            type: tType,
            player: playerName,
            playerNum: mainIt?.Pnum ? Number(mainIt.Pnum) : null,
            assist: assistName,
            score: Array.isArray(item.Sc) ? [item.Sc[0], item.Sc[1]] : null,
            varReason: item.IR || mainIt?.IR || null,
          })
        } else {
          // Single incident (Card, direct goal, disallowed goal)
          const code = item.IT
          let tType: MatchIncident["type"] | null = null

          if (code === 43) tType = "yellow-card"
          else if (code === 44) tType = "second-yellow"
          else if (code === 45) tType = "red-card"
          else if (code === 36) tType = "goal"
          else if (code === 37) tType = "penalty"
          else if (code === 39) tType = "own-goal"
          else if (code === 62) tType = "disallowed-goal"

          if (!tType) continue

          const playerName =
            item.Pn || `${item.Fn || ""} ${item.Ln || ""}`.trim() || "Player"

          incidents.push({
            id: `${eid}-${halfKey}-${minVal}-${i}`,
            min: minVal,
            minEx,
            minDisplay,
            half: Number(halfKey),
            team,
            type: tType,
            player: playerName,
            playerNum: item.Pnum ? Number(item.Pnum) : null,
            assist: null,
            score: Array.isArray(item.Sc) ? [item.Sc[0], item.Sc[1]] : null,
            varReason: item.IR || null,
          })
        }
      }
    }

    // Sort chronologically by minute + stoppage time
    incidents.sort((a, b) => {
      if (a.half !== b.half) return a.half - b.half
      if (a.min !== b.min) return a.min - b.min
      return (a.minEx ?? 0) - (b.minEx ?? 0)
    })

    const payload: MatchSummaryResponse = {
      eid,
      home,
      away,
      status: matchInfo.status || "Scheduled",
      scores: {
        ht: htScore,
        ft: ftScore,
      },
      matchInfo,
      incidents,
    }

    summaryCache.set(eid, { timestamp: Date.now(), data: payload })

    return NextResponse.json(payload, {
      headers: { "Cache-Control": "public, s-maxage=10, stale-while-revalidate=20" },
    })
  } catch (err) {
    console.error(`[livescores/summary] Error processing eid ${eid}:`, err)
    return NextResponse.json(
      {
        eid,
        home,
        away,
        status: "Error",
        scores: { ht: null, ft: null },
        matchInfo: {},
        incidents: [],
      },
      { status: 500 },
    )
  }
}
