import type { DiscoveredEvent, Fixture, ProviderAdapter } from "./types"
import { fetchDamiTvStreams } from "@/lib/damitv/client"
import { matchFixtureToDamiTv } from "@/lib/damitv/matcher"

export const damitvAdapter: ProviderAdapter = {
  name: "DAMITV",
  baseUrl: "https://damitv.st",
  async discover(fixture: Fixture, _signal: AbortSignal): Promise<DiscoveredEvent[]> {
    const streams = await fetchDamiTvStreams()
    const matched = matchFixtureToDamiTv(fixture, streams)

    if (!matched) return []

    const stream = matched.stream

    // If stream has multiple sources, surface them, otherwise default embed
    if (stream.sources && stream.sources.length > 0) {
      return stream.sources.map((src) => ({
        provider: "DAMITV",
        eventId: `${stream.id}:${src.id}`,
        home: stream.home,
        away: stream.away,
        competition: fixture.league,
        kickoff: stream.kickoffIso,
        status: stream.isLive ? "live" : stream.status === "UPCOMING" ? "scheduled" : "ended",
        url: src.embed,
        embeddable: true,
        confidence: matched.confidence / 100,
      }))
    }

    return [
      {
        provider: "DAMITV",
        eventId: stream.id,
        home: stream.home,
        away: stream.away,
        competition: fixture.league,
        kickoff: stream.kickoffIso,
        status: stream.isLive ? "live" : stream.status === "UPCOMING" ? "scheduled" : "ended",
        url: stream.embedUrl,
        embeddable: true,
        confidence: matched.confidence / 100,
      },
    ]
  },
}
