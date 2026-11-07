import { NextResponse } from "next/server"
import { resolveLiveScoreEvent } from "@/lib/livescores-resolver"

const CACHE_TTL_MS = 60_000

type CachedH2H = {
  timestamp: number
  data: any
}

const h2hCache = new Map<string, CachedH2H>()

export type H2HMatch = {
  date: string
  league: string
  home: string
  away: string
  homeScore: number
  awayScore: number
  winner: "home" | "away" | "draw"
}

export type H2HResponse = {
  homeTeam: string
  awayTeam: string
  homeForm: string[]
  awayForm: string[]
  matches: H2HMatch[]
}

function slugify(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const eidParam = searchParams.get("eid")
  const fixtureIdParam = searchParams.get("fixture_id")

  const matchEvent = await resolveLiveScoreEvent(eidParam, fixtureIdParam)
  if (!matchEvent?.eid) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 })
  }

  const { eid, home, away, countryCode, stageCode } = matchEvent

  const cached = h2hCache.get(eid)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return NextResponse.json(cached.data, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
    })
  }

  try {
    const t1Slug = slugify(home)
    const t2Slug = slugify(away)
    const url = `https://www.livescore.com/en/football/${countryCode || "international"}/${stageCode || "league"}/${t1Slug}-vs-${t2Slug}/${eid}/h2h/`

    const res = await fetch(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
      next: { revalidate: 60 },
    })

    if (!res.ok) {
      return NextResponse.json({
        homeTeam: home,
        awayTeam: away,
        homeForm: [],
        awayForm: [],
        matches: [],
      })
    }

    const html = await res.text()
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([^<]+)<\/script>/)
    if (!nextDataMatch) {
      return NextResponse.json({
        homeTeam: home,
        awayTeam: away,
        homeForm: [],
        awayForm: [],
        matches: [],
      })
    }

    const nextJson = JSON.parse(nextDataMatch[1])
    const eventData = nextJson?.props?.pageProps?.initialEventData?.event
    const rawH2H = eventData?.headToHead?.h2h || []
    const homeForm = Array.isArray(eventData?.homeScoreForm) ? eventData.homeScoreForm.map((f: string) => f.toUpperCase()) : []
    const awayForm = Array.isArray(eventData?.awayScoreForm) ? eventData.awayScoreForm.map((f: string) => f.toUpperCase()) : []

    const matches: H2HMatch[] = []
    for (const stg of rawH2H) {
      const stageName = stg?.stage?.stageName || stg?.stage?.countryName || "League"
      for (const ev of stg?.events || []) {
        const hScore = parseInt(ev.homeScore, 10) || 0
        const aScore = parseInt(ev.awayScore, 10) || 0
        const winner = hScore > aScore ? "home" : aScore > hScore ? "away" : "draw"

        let formattedDate = ""
        if (ev.startDateTimeString && ev.startDateTimeString.length >= 8) {
          const y = ev.startDateTimeString.slice(0, 4)
          const m = ev.startDateTimeString.slice(4, 6)
          const d = ev.startDateTimeString.slice(6, 8)
          formattedDate = `${d}/${m}/${y}`
        }

        matches.push({
          date: formattedDate,
          league: stageName,
          home: ev.homeName || home,
          away: ev.awayName || away,
          homeScore: hScore,
          awayScore: aScore,
          winner,
        })
      }
    }

    const result: H2HResponse = {
      homeTeam: home,
      awayTeam: away,
      homeForm: homeForm.slice(-5), // last 5 matches
      awayForm: awayForm.slice(-5),
      matches: matches.slice(0, 10), // last 10 h2h encounters
    }

    h2hCache.set(eid, { timestamp: Date.now(), data: result })

    return NextResponse.json(result, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
    })
  } catch (err) {
    console.error("[livescores/h2h] Error fetching h2h:", err)
    return NextResponse.json({ error: "Failed to fetch H2H" }, { status: 500 })
  }
}
