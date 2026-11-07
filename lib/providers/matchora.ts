import type { DiscoveredEvent, Fixture, ProviderAdapter } from "./types"
import { fetchMatchoraSchedule } from "@/lib/matchora/client"
import { matchFixtureToMatchora } from "@/lib/matchora/matcher"

export const matchoraAdapter: ProviderAdapter = {
  name: "Matchora",
  baseUrl: "https://matchora.pro",
  async discover(fixture: Fixture, _signal: AbortSignal): Promise<DiscoveredEvent[]> {
    let events = await fetchMatchoraSchedule({ date: fixture.date })
    if (!events || events.length === 0) {
      events = await fetchMatchoraSchedule({ watchable: true })
    }
    const matched = matchFixtureToMatchora(fixture, events)

    if (!matched) return []

    const event = matched.event

    return [
      {
        provider: "Matchora",
        eventId: event.id,
        home: event.home,
        away: event.away,
        competition: fixture.league,
        kickoff: new Date(event.kickoff).toISOString(),
        status: event.status === "live" ? "live" : event.status === "upcoming" ? "scheduled" : "ended",
        url: event.embedUrl,
        embeddable: true,
        confidence: matched.confidence / 100,
      },
    ]
  },
}

