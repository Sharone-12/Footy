import type { DiscoveredEvent, Fixture, ProviderAdapter } from "./types"
import { fetchSoccerStreams } from "@/lib/streamfree/client"
import { matchFixtureToStream } from "@/lib/streamfree/matcher"

export const streamfreeAdapter: ProviderAdapter = {
  name: "StreamFree",
  baseUrl: "https://streamfree.top",
  async discover(fixture: Fixture, _signal: AbortSignal): Promise<DiscoveredEvent[]> {
    const streams = await fetchSoccerStreams()
    const matched = matchFixtureToStream(fixture, streams)

    if (!matched) return []

    const bestSource = matched.bestSource
    const streamUrl = bestSource?.url || `https://streamfree.top/api/v1/streams/${matched.streamKey}`

    return [
      {
        provider: "StreamFree",
        eventId: matched.streamKey,
        home: matched.matchedTeams.home,
        away: matched.matchedTeams.away,
        competition: matched.league,
        kickoff: matched.matchTimestamp ? new Date(matched.matchTimestamp * 1000).toISOString() : null,
        status: matched.isLive ? "live" : matched.status === "UPCOMING" ? "scheduled" : "ended",
        url: streamUrl,
        embeddable: true,
        confidence: matched.confidence,
      },
    ]
  },
}

