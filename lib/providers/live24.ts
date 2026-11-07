import type { DiscoveredEvent, Fixture, ProviderAdapter } from "./types"
import { fetchLive24Events } from "@/lib/live24/client"
import { matchFixtureToLive24 } from "@/lib/live24/matcher"

export const live24Adapter: ProviderAdapter = {
  name: "Live24",
  baseUrl: "https://guidetv.live",
  async discover(fixture: Fixture, _signal: AbortSignal): Promise<DiscoveredEvent[]> {
    const events = await fetchLive24Events()
    const matched = matchFixtureToLive24(fixture, events)

    if (!matched) return []

    const event = matched.event

    return [
      {
        provider: "Live24",
        eventId: event.id,
        home: event.homeTeam,
        away: event.awayTeam,
        competition: fixture.league,
        kickoff: event.timestampMs ? new Date(event.timestampMs).toISOString() : fixture.kickoff,
        status: event.isLive ? "live" : "scheduled",
        url: event.primaryStreamUrl || "",
        embeddable: true,
        confidence: matched.matchConfidence / 100,
      },
    ]
  },
}
