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
const PROVIDER_TIMEOUT_MS = 3_500

let cache: { timestamp: number; eventIds: number[] } | null = null
let inflight: Promise<number[]> | null = null

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ])
}

async function computeActiveStreamEventIds(): Promise<number[]> {
  const now = new Date()
  const nowMs = now.getTime()
  const yesterday = new Date(nowMs - 86_400_000).toISOString().slice(0, 10)
  const tomorrow = new Date(nowMs + 86_400_000).toISOString().slice(0, 10)

  // 1. Fetch fixtures around today from Supabase
  const { data: fixturesRaw } = await supabase
    .from("matches")
    .select("event_id, date, kickoff, league, home, home_id, away, away_id")
    .gte("date", yesterday)
    .lte("date", tomorrow)

  const fixtures = (fixturesRaw || []) as Fixture[]
  if (fixtures.length === 0) return cache?.eventIds || []

  // Create a map of fixture broadcast windows:
  // Match is live if within [-30 min before kickoff, +150 min after kickoff]
  const broadcastWindowMap = new Map<number, boolean>()
  for (const f of fixtures) {
    const kickoffMs = f.kickoff ? Date.parse(f.kickoff) : Date.parse(`${f.date}T12:00:00Z`)
    const inWindow = Number.isFinite(kickoffMs)
      ? nowMs >= kickoffMs - 30 * 60_000 && nowMs <= kickoffMs + 150 * 60_000
      : true
    broadcastWindowMap.set(f.event_id, inWindow)
  }

  const activeSet = new Set<number>()

  // 2. Fetch raw streams from enabled providers in parallel with timeouts
  const [damiRes, live24Res, cinevidRes, matchoraRes, streamfreeRes, daddyRes, zliveRes] =
    await Promise.allSettled([
      isProviderEnabled("damitv")
        ? withTimeout(fetchDamiTvStreams().catch(() => []), PROVIDER_TIMEOUT_MS, [])
        : Promise.resolve([]),
      isProviderEnabled("live24")
        ? withTimeout(fetchLive24Events().catch(() => []), PROVIDER_TIMEOUT_MS, [])
        : Promise.resolve([]),
      isProviderEnabled("cinevid")
        ? withTimeout(fetchCinevidEvents().catch(() => []), PROVIDER_TIMEOUT_MS, [])
        : Promise.resolve([]),
      isProviderEnabled("matchora")
        ? withTimeout(fetchMatchoraSchedule().catch(() => []), PROVIDER_TIMEOUT_MS, [])
        : Promise.resolve([]),
      isProviderEnabled("streamfree")
        ? withTimeout(fetchSoccerStreams().catch(() => []), PROVIDER_TIMEOUT_MS, [])
        : Promise.resolve([]),
      isProviderEnabled("daddylive")
        ? withTimeout(fetchDaddyLiveSchedule().catch(() => []), PROVIDER_TIMEOUT_MS, [])
        : Promise.resolve([]),
      isProviderEnabled("zlive")
        ? withTimeout(fetchFootballChannels().catch(() => []), PROVIDER_TIMEOUT_MS, [])
        : Promise.resolve([]),
    ])

  // 3. Match against fixtures and gather event IDs with confirmed live streams
  if (damiRes.status === "fulfilled" && damiRes.value.length > 0) {
    const damiMap = matchFixturesToDamiTv(fixtures, damiRes.value)
    for (const [id, m] of damiMap.entries()) {
      if (m?.isConfirmedMatch && m.stream.sources.length > 0) {
        if (m.stream.isLive || broadcastWindowMap.get(id)) activeSet.add(id)
      }
    }
  }

  if (live24Res.status === "fulfilled" && live24Res.value.length > 0) {
    const live24Map = matchFixturesToLive24(fixtures, live24Res.value)
    for (const [idStr, m] of Object.entries(live24Map)) {
      const id = Number(idStr)
      if (m && m.event.streams.length > 0) {
        if (m.event.isLive || broadcastWindowMap.get(id)) activeSet.add(id)
      }
    }
  }

  if (cinevidRes.status === "fulfilled" && cinevidRes.value.length > 0) {
    const cinevidMap = matchFixturesToCinevid(fixtures, cinevidRes.value)
    for (const [idStr, m] of Object.entries(cinevidMap)) {
      const id = Number(idStr)
      if (m?.isConfirmedMatch) {
        if (broadcastWindowMap.get(id)) activeSet.add(id)
      }
    }
  }

  if (matchoraRes.status === "fulfilled" && matchoraRes.value.length > 0) {
    const matchoraMap = matchFixturesToMatchora(fixtures, matchoraRes.value)
    for (const [idStr, m] of Object.entries(matchoraMap)) {
      const id = Number(idStr)
      if (m && m.event.channelCount > 0) {
        if (broadcastWindowMap.get(id)) activeSet.add(id)
      }
    }
  }

  if (streamfreeRes.status === "fulfilled" && streamfreeRes.value.length > 0) {
    const sfMap = matchFixturesToStreamFree(fixtures, streamfreeRes.value)
    for (const [id, m] of sfMap.entries()) {
      if (m && m.sources.length > 0) {
        if (m.isLive || broadcastWindowMap.get(id)) activeSet.add(id)
      }
    }
  }

  if (daddyRes.status === "fulfilled" && daddyRes.value.length > 0) {
    const daddyMap = matchFixturesToDaddyLive(fixtures, daddyRes.value)
    for (const [id, m] of daddyMap.entries()) {
      if (m?.isConfirmedMatch && m.channels.length > 0) {
        if (broadcastWindowMap.get(id)) activeSet.add(id)
      }
    }
  }

  if (zliveRes.status === "fulfilled" && zliveRes.value.length > 0) {
    const zMap = matchFixturesToZLive(fixtures, zliveRes.value)
    for (const [id, m] of zMap.entries()) {
      if (m?.isConfirmedMatch) {
        if (broadcastWindowMap.get(id)) activeSet.add(id)
      }
    }
  }

  return Array.from(activeSet)
}

export async function GET() {
  const now = Date.now()

  // 1. If cache is fresh, return immediately
  if (cache && now - cache.timestamp < CACHE_TTL_MS) {
    return NextResponse.json(
      {
        eventIds: cache.eventIds,
        cached: true,
        timestamp: cache.timestamp,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
        },
      },
    )
  }

  // 2. Trigger or join in-flight background discovery
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

  // 3. Stale-while-revalidate: if we have any existing cache, return it immediately!
  if (cache) {
    return NextResponse.json(
      {
        eventIds: cache.eventIds,
        cached: true,
        stale: true,
        timestamp: cache.timestamp,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
        },
      },
    )
  }

  // 4. First cold load: wait for inflight
  try {
    const eventIds = await inflight
    return NextResponse.json(
      {
        eventIds,
        cached: false,
        timestamp: Date.now(),
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
        },
      },
    )
  } catch (err) {
    console.warn("[streams/active] Error computing active streams:", err)
    return NextResponse.json(
      {
        eventIds: [],
        error: "Failed to compute active streams",
      },
      { status: 200 },
    )
  }
}
