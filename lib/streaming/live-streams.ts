/**
 * One provider fan-out for the whole live window, shared by every caller.
 *
 * Before this, the /live page fired seven provider routes and the score store
 * polled /api/streams/active, and each of those ran its own Supabase query
 * and its own matching pass over the same fixtures. Eight invocations per
 * page load for one answer. This module computes that answer once per
 * window; the routes just shape it.
 *
 * ponytail: per-instance cache, same as lib/providers/discover.ts. Two warm
 * instances means two fan-outs per window, not a wrong answer. Move to the
 * Vercel Runtime Cache only if the invocation bill says so.
 */
import { supabase } from "@/lib/supabase"
import type { Fixture } from "@/lib/providers/types"
import { isProviderEnabled } from "@/lib/streaming/config"
import type { StreamingProviderId } from "@/lib/streaming/types"
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
import type { MatchedStream } from "@/lib/streamfree/types"
import type { MatchedZLive } from "@/lib/zlive/types"
import type { MatchedDaddyLive } from "@/lib/daddylive/types"
import type { MatchedDamiTv } from "@/lib/damitv/types"
import type { MatchedCinevid } from "@/lib/cinevid/types"
import type { MatchedLive24 } from "@/lib/live24/types"
import type { MatchedMatchora } from "@/lib/matchora/types"

/** Matches the CDN s-maxage on the routes that serve this. */
export const LIVE_STREAMS_TTL_MS = 60_000
const PROVIDER_TIMEOUT_MS = 5_000

/** Streams unlock 15 minutes before kickoff and stay through a late finish. */
const PRE_KICKOFF_MS = 15 * 60_000
const POST_KICKOFF_MS = 150 * 60_000

type WithId<T> = T & { event_id: number }

export type LiveStreams = {
  at: number
  /** Fixtures with at least one confirmed stream inside their broadcast window. */
  active: number[]
  matchora: WithId<MatchedMatchora>[]
  streamfree: WithId<MatchedStream>[]
  zlive: WithId<MatchedZLive>[]
  daddylive: WithId<MatchedDaddyLive>[]
  damitv: WithId<MatchedDamiTv>[]
  cinevid: WithId<MatchedCinevid>[]
  live24: WithId<MatchedLive24>[]
}

const EMPTY: LiveStreams = {
  at: 0, active: [], matchora: [], streamfree: [], zlive: [],
  daddylive: [], damitv: [], cinevid: [], live24: [],
}

let cache: LiveStreams | null = null
let inflight: Promise<LiveStreams> | null = null

function withTimeout<T>(promise: Promise<T>, fallback: T): Promise<T> {
  return Promise.race([
    promise.catch(() => fallback),
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), PROVIDER_TIMEOUT_MS)),
  ])
}

/** Either Map or Record, which is what the seven matchers hand back between them. */
function withIds<T>(m: Map<number, T> | Record<number, T>): WithId<T>[] {
  const pairs: [number, T][] = m instanceof Map
    ? Array.from(m.entries())
    : Object.entries(m).map(([k, v]) => [Number(k), v])
  return pairs.map(([event_id, v]) => ({ ...v, event_id }))
}

async function compute(): Promise<LiveStreams> {
  const nowMs = Date.now()
  const yesterday = new Date(nowMs - 86_400_000).toISOString().slice(0, 10)
  const tomorrow = new Date(nowMs + 86_400_000).toISOString().slice(0, 10)

  const { data } = await supabase
    .from("matches")
    .select("event_id, date, kickoff, league, home, home_id, away, away_id")
    .gte("date", yesterday)
    .lte("date", tomorrow)
  const fixtures = (data || []) as Fixture[]
  if (fixtures.length === 0) return { ...EMPTY, at: nowMs }

  const inWindow = new Set<number>()
  for (const f of fixtures) {
    const kickoff = f.kickoff ? Date.parse(f.kickoff) : Date.parse(`${f.date}T12:00:00Z`)
    if (!Number.isFinite(kickoff) || (nowMs >= kickoff - PRE_KICKOFF_MS && nowMs <= kickoff + POST_KICKOFF_MS)) {
      inWindow.add(f.event_id)
    }
  }

  const on = (id: StreamingProviderId) => isProviderEnabled(id)
  const [dami, live24, cinevid, matchora, streamfree, daddy, zlive] = await Promise.all([
    on("damitv") ? withTimeout(fetchDamiTvStreams(), []) : [],
    on("live24") ? withTimeout(fetchLive24Events(), []) : [],
    on("cinevid") ? withTimeout(fetchCinevidEvents(), []) : [],
    on("matchora") ? withTimeout(fetchMatchoraSchedule(), []) : [],
    on("streamfree") ? withTimeout(fetchSoccerStreams(), []) : [],
    on("daddylive") ? withTimeout(fetchDaddyLiveSchedule(), []) : [],
    on("zlive") ? withTimeout(fetchFootballChannels(), []) : [],
  ])

  const out: LiveStreams = {
    ...EMPTY,
    at: nowMs,
    damitv: dami.length ? withIds(matchFixturesToDamiTv(fixtures, dami)) : [],
    live24: live24.length ? withIds(matchFixturesToLive24(fixtures, live24)) : [],
    cinevid: cinevid.length ? withIds(matchFixturesToCinevid(fixtures, cinevid)) : [],
    matchora: matchora.length ? withIds(matchFixturesToMatchora(fixtures, matchora)) : [],
    streamfree: streamfree.length ? withIds(matchFixturesToStreamFree(fixtures, streamfree)) : [],
    daddylive: daddy.length ? withIds(matchFixturesToDaddyLive(fixtures, daddy)) : [],
    zlive: zlive.length ? withIds(matchFixturesToZLive(fixtures, zlive)) : [],
  }

  const active = new Set<number>()
  const add = (id: number, live: boolean) => { if (live || inWindow.has(id)) active.add(id) }
  for (const m of out.damitv) if (m.isConfirmedMatch && m.stream.sources.length) add(m.event_id, m.stream.isLive)
  for (const m of out.live24) if (m.event.streams.length) add(m.event_id, m.event.isLive)
  for (const m of out.cinevid) if (m.isConfirmedMatch) add(m.event_id, false)
  for (const m of out.matchora) if (m.event.channelCount > 0) add(m.event_id, false)
  for (const m of out.streamfree) if (m.sources.length) add(m.event_id, m.isLive)
  for (const m of out.daddylive) if (m.isConfirmedMatch && m.channels.length) add(m.event_id, false)
  for (const m of out.zlive) if (m.isConfirmedMatch) add(m.event_id, false)
  out.active = Array.from(active)

  return out
}

/**
 * The current window's streams. Fresh within the TTL; past it the last
 * answer is returned at once and a refresh runs behind it, so a stale list
 * for a few seconds never turns into a blocking fan-out.
 */
export function getLiveStreams(): Promise<LiveStreams> {
  if (cache && Date.now() - cache.at < LIVE_STREAMS_TTL_MS) return Promise.resolve(cache)

  if (!inflight) {
    inflight = compute()
      .then((result) => (cache = result))
      .catch((err) => {
        console.warn("[live-streams] fan-out failed:", err)
        return cache ?? { ...EMPTY, at: Date.now() }
      })
      .finally(() => { inflight = null })
  }
  return cache ? Promise.resolve(cache) : inflight
}
