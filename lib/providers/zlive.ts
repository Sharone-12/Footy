import type { DiscoveredEvent, Fixture, ProviderAdapter } from "./types"
import { fetchFootballChannels } from "@/lib/zlive/client"
import { matchFixtureToZLive } from "@/lib/zlive/matcher"

export const zliveAdapter: ProviderAdapter = {
  name: "ZLive",
  baseUrl: "https://zlive.st",
  async discover(fixture: Fixture, _signal: AbortSignal): Promise<DiscoveredEvent[]> {
    const channels = await fetchFootballChannels()
    const matched = matchFixtureToZLive(fixture, channels)

    if (!matched) return []

    const ch = matched.channel
    return [
      {
        provider: "ZLive",
        eventId: ch.id,
        home: fixture.home,
        away: fixture.away,
        competition: fixture.league,
        kickoff: null,
        status: ch.live ? "live" : "scheduled",
        url: ch.url || `https://zlive.st/embed/${ch.id}`,
        embeddable: true,
        confidence: matched.confidence,
      },
    ]
  },
}
