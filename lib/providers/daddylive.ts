import type { DiscoveredEvent, Fixture, ProviderAdapter } from "./types"
import { fetchDaddyLiveSchedule } from "@/lib/daddylive/client"
import { matchFixtureToDaddyLive } from "@/lib/daddylive/matcher"

export const daddyliveAdapter: ProviderAdapter = {
  name: "DaddyLive",
  baseUrl: "https://thedaddy.li",
  async discover(fixture: Fixture, _signal: AbortSignal): Promise<DiscoveredEvent[]> {
    const events = await fetchDaddyLiveSchedule()
    const matched = matchFixtureToDaddyLive(fixture, events)

    if (!matched || matched.channels.length === 0) return []

    // Return all discovered channels for this fixture
    return matched.channels.map((ch) => ({
      provider: "DaddyLive",
      eventId: ch.channel_id,
      home: matched.event.home,
      away: matched.event.away,
      competition: fixture.league,
      kickoff: matched.event.kickoffIso,
      status: "live",
      url: ch.player_url,
      embeddable: true,
      confidence: matched.confidence / 100,
    }))
  },
}
