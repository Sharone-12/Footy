import type { DiscoveredEvent, Fixture, ProviderAdapter } from "./types"
import { CINEVID_BASE_URL, fetchCinevidEvents } from "@/lib/cinevid/client"
import { matchFixtureToCinevid } from "@/lib/cinevid/matcher"

export const cinevidAdapter: ProviderAdapter = {
  name: "Cinevid",
  baseUrl: CINEVID_BASE_URL,
  async discover(fixture: Fixture, _signal: AbortSignal): Promise<DiscoveredEvent[]> {
    const events = await fetchCinevidEvents()
    const matched = matchFixtureToCinevid(fixture, events)

    if (!matched) return []

    const event = matched.event

    return [
      {
        provider: "Cinevid",
        eventId: event.id,
        home: event.home,
        away: event.away,
        competition: fixture.league,
        kickoff: event.kickoffIso,
        status: event.isLive ? "live" : event.status === "UPCOMING" ? "scheduled" : "ended",
        url: event.playerUrl,
        embeddable: true,
        confidence: matched.confidence / 100,
      },
    ]
  },
}

