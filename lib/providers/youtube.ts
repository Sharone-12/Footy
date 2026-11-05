/**
 * YouTube Data API v3 search.
 *
 * A documented listing API over an embeddable player — the combination the
 * rest of this engine needs. Needs YOUTUBE_API_KEY.
 *
 * Two passes. `search` is the only endpoint that can find a live or upcoming
 * broadcast, but it returns no start time, and a title alone ("Atletico vs
 * Barcelona LIVE") scores only 0.6 — below the threshold, which is correct,
 * because that title also fits last season's game. So the shortlist goes
 * through `videos.list` for `liveStreamingDetails`, and the real scheduled
 * start is what lifts a genuine match over the bar.
 *
 * Quota: 100 units per search (two searches), 1 unit for the batched
 * videos.list. The orchestrator's cache is what keeps that affordable.
 */
import type { Candidate } from "./match"
import { round2, score, threshold } from "./match"
import type { DiscoveredEvent, Fixture, ProviderAdapter } from "./types"

type SearchItem = {
  id?: { videoId?: string }
  snippet?: { title?: string; channelTitle?: string; liveBroadcastContent?: string }
}

type VideoItem = {
  id?: string
  snippet?: { title?: string; liveBroadcastContent?: string }
  liveStreamingDetails?: {
    scheduledStartTime?: string
    actualStartTime?: string
    actualEndTime?: string
  }
}

const BASE = process.env.YOUTUBE_API_BASE || "https://www.googleapis.com/youtube/v3"

/** The key travels in the query string, so only a status ever reaches a log. */
async function call<T>(path: string, params: Record<string, string>, signal: AbortSignal): Promise<T> {
  const url = new URL(`${BASE}/${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  url.searchParams.set("key", process.env.YOUTUBE_API_KEY!)
  const res = await fetch(url, { signal })
  if (!res.ok) {
    // A rejected key or a spent quota will not fix itself on an immediate
    // second try, and re-sending into a 429 makes it worse; only a 5xx is
    // worth retrying. See runProvider in discover.ts.
    throw Object.assign(new Error(`youtube ${path}: HTTP ${res.status}`), {
      retryable: res.status >= 500,
    })
  }
  return (await res.json()) as T
}

const searchFor = (fixture: Fixture, eventType: "live" | "upcoming", signal: AbortSignal) =>
  call<{ items?: SearchItem[] }>(
    "search",
    {
      part: "snippet",
      type: "video",
      eventType,
      maxResults: "10",
      q: `${fixture.home} ${fixture.away}`,
    },
    signal,
  ).then((b) => b.items ?? [])

export const youtubeAdapter: ProviderAdapter = {
  name: "YouTube",
  baseUrl: "https://www.youtube.com",
  async discover(fixture, signal): Promise<DiscoveredEvent[]> {
    const found = (
      await Promise.all([
        searchFor(fixture, "live", signal),
        searchFor(fixture, "upcoming", signal),
      ])
    ).flat()

    // Shortlist on the title first: both teams named, scored without a time.
    // Everything else is dropped before spending a second request on it.
    const shortlist = new Map<string, string>()
    for (const item of found) {
      const id = item.id?.videoId
      const title = item.snippet?.title
      if (!id || !title || shortlist.has(id)) continue
      const text = `${title} ${item.snippet?.channelTitle ?? ""}`
      if (score(fixture, { title: text, kickoff: null }) > 0) shortlist.set(id, text)
    }
    if (shortlist.size === 0) return []

    const { items = [] } = await call<{ items?: VideoItem[] }>(
      "videos",
      { part: "snippet,liveStreamingDetails", id: [...shortlist.keys()].join(",") },
      signal,
    )

    const min = threshold()
    const out: DiscoveredEvent[] = []
    for (const v of items) {
      const id = v.id
      if (!id) continue
      // An ended broadcast is a replay, not this fixture's stream.
      if (v.liveStreamingDetails?.actualEndTime) continue

      const start =
        v.liveStreamingDetails?.actualStartTime ??
        v.liveStreamingDetails?.scheduledStartTime ??
        null
      const candidate: Candidate = {
        title: shortlist.get(id) ?? v.snippet?.title ?? "",
        kickoff: start,
      }
      const confidence = score(fixture, candidate)
      if (confidence < min) continue

      out.push({
        provider: "YouTube",
        eventId: id,
        home: fixture.home,
        away: fixture.away,
        competition: fixture.league,
        kickoff: start ?? fixture.kickoff,
        status: v.snippet?.liveBroadcastContent === "live" ? "live" : "scheduled",
        url: `https://www.youtube.com/watch?v=${id}`,
        // Every YouTube watch URL resolves to the -nocookie embed; see
        // embedFor in lib/stream-embed.ts.
        embeddable: true,
        confidence: round2(confidence),
      })
    }
    return out
  },
}
