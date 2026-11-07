import { NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"
import type { Fixture } from "@/lib/providers/types"
import { isProviderEnabled } from "@/lib/streaming/config"
import { fetchDamiTvStreams } from "@/lib/damitv/client"
import { matchFixturesToDamiTv } from "@/lib/damitv/matcher"
import { fetchLive24Events } from "@/lib/live24/client"
import { matchFixturesToLive24 } from "@/lib/live24/matcher"
import { fetchCinevidEvents } from "@/lib/cinevid/client"
import { matchFixturesToCinevid } from "@/lib/cinevid/matcher"
import { fetchMatchoraSchedule } from "@/lib/matchora/client"
import { matchFixturesToMatchora } from "@/lib/matchora/matcher"
import { fetchSoccerStreams } from "@/lib/streamfree/client"
import { matchFixtures as matchFixturesToStreamFree } from "@/lib/streamfree/matcher"
import { fetchDaddyLiveSchedule } from "@/lib/daddylive/client"
import { matchFixturesToDaddyLive } from "@/lib/daddylive/matcher"
import { fetchFootballChannels } from "@/lib/zlive/client"
import { matchFixturesToZLive } from "@/lib/zlive/matcher"

const CACHE_TTL_MS = 30_000
let cache: { timestamp: number; eventIds: number[] } | null = null
let inflight: Promise<number[]> | null = null

async function computeActiveStreamEventIds(): Promise<number[]> {
  const now = new Date()
  const yesterday = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10)
  const tomorrow = new Date(now.getTime() + 86_400_000).toISOString().slice(0, 10)

  // 1. Fetch fixtures around today from Supabase
  const { data: fixturesRaw } = await supabase
    .from("matches")
    .select("event_id, date, kickoff, league, home, home_id, away, away_id")
    .gte("date", yesterday)
    .lte("date", tomorrow)

  const fixtures = (fixturesRaw || []) as Fixture[]
  if (fixtures.length === 0) return []

  const activeSet = new Set<number>()

  // 2. Fetch raw streams from enabled providers in parallel
  const [damiRes, live24Res, cinevidRes, matchoraRes, streamfreeRes, daddyRes, zliveRes] =
    await Promise.allSettled([
      isProviderEnabled("damitv") ? fetchDamiTvStreams().catch(() => []) : Promise.resolve([]),
      isProviderEnabled("live24") ? fetchLive24Events().catch(() => []) : Promise.resolve([]),
      isProviderEnabled("cinevid") ? fetchCinevidEvents().catch(() => []) : Promise.resolve([]),
      isProviderEnabled("matchora") ? fetchMatchoraSchedule().catch(() => []) : Promise.resolve([]),
      isProviderEnabled("streamfree") ? fetchSoccerStreams().catch(() => []) : Promise.resolve([]),
      isProviderEnabled("daddylive") ? fetchDaddyLiveSchedule().catch(() => []) : Promise.resolve([]),
      isProviderEnabled("zlive") ? fetchFootballChannels().catch(() => []) : Promise.resolve([]),
    ])

  // 3. Match against fixtures and gather event IDs with confirmed streams
  if (damiRes.status === "fulfilled" && damiRes.value.length > 0) {
    const damiMap = matchFixturesToDamiTv(fixtures, damiRes.value)
    for (const [id, m] of damiMap.entries()) {
      if (m?.isConfirmedMatch && m.stream.sources.length > 0) activeSet.add(id)
    }
  }

  if (live24Res.status === "fulfilled" && live24Res.value.length > 0) {
    const live24Map = matchFixturesToLive24(fixtures, live24Res.value)
    for (const [id, m] of Object.entries(live24Map)) {
      if (m && m.event.streams.length > 0) activeSet.add(Number(id))
    }
  }

  if (cinevidRes.status === "fulfilled" && cinevidRes.value.length > 0) {
    const cinevidMap = matchFixturesToCinevid(fixtures, cinevidRes.value)
    for (const [id, m] of Object.entries(cinevidMap)) {
      if (m?.isConfirmedMatch) activeSet.add(Number(id))
    }
  }

  if (matchoraRes.status === "fulfilled" && matchoraRes.value.length > 0) {
    const matchoraMap = matchFixturesToMatchora(fixtures, matchoraRes.value)
    for (const [id, m] of Object.entries(matchoraMap)) {
      if (m && m.event.channelCount > 0) activeSet.add(Number(id))
    }
  }

  if (streamfreeRes.status === "fulfilled" && streamfreeRes.value.length > 0) {
    const sfMap = matchFixturesToStreamFree(fixtures, streamfreeRes.value)
    for (const [id, m] of sfMap.entries()) {
      if (m && m.sources.length > 0) activeSet.add(id)
    }
  }

  if (daddyRes.status === "fulfilled" && daddyRes.value.length > 0) {
    const daddyMap = matchFixturesToDaddyLive(fixtures, daddyRes.value)
    for (const [id, m] of daddyMap.entries()) {
      if (m?.isConfirmedMatch && m.channels.length > 0) activeSet.add(id)
    }
  }

  if (zliveRes.status === "fulfilled" && zliveRes.value.length > 0) {
    const zMap = matchFixturesToZLive(fixtures, zliveRes.value)
    for (const [id, m] of zMap.entries()) {
      if (m?.isConfirmedMatch) activeSet.add(id)
    }
  }

  return Array.from(activeSet)
}

export async function GET() {
  const now = Date.now()
  if (cache && now - cache.timestamp < CACHE_TTL_MS) {
    return NextResponse.json({
      eventIds: cache.eventIds,
      cached: true,
      timestamp: cache.timestamp,
    }, {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    })
  }

  if (!inflight) {
    inflight = computeActiveStreamEventIds()
      .then((eventIds) => {
        cache = { timestamp: Date.now(), eventIds }
        return eventIds
      })
      .finally(() => {
        inflight = null
      })
  }

  try {
    const eventIds = await inflight
    return NextResponse.json({
      eventIds,
      cached: false,
      timestamp: Date.now(),
    }, {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    })
  } catch (err) {
    console.warn("[streams/active] Error computing active streams:", err)
    return NextResponse.json({
      eventIds: cache?.eventIds || [],
      error: "Failed to compute active streams",
    }, { status: 200 })
  }
}
