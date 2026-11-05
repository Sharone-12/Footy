/**
 * The hand-kept map in lib/match-streams.ts, as a provider.
 *
 * Zero configuration and always right, so it stays the highest-priority
 * source: a URL you put there is the one you meant, and discovery never has
 * to guess. Keeps `MATCH_STREAMS` useful instead of superseding it.
 */
import { MATCH_STREAMS } from "@/lib/match-streams"
import { embedFor } from "@/lib/stream-embed"
import type { DiscoveredEvent, Fixture, ProviderAdapter } from "./types"

export const manualAdapter: ProviderAdapter = {
  name: "Manual",
  baseUrl: "",
  async discover(fixture: Fixture): Promise<DiscoveredEvent[]> {
    const url = MATCH_STREAMS[fixture.event_id]
    if (!url) return []
    return [
      {
        provider: "Manual",
        eventId: String(fixture.event_id),
        home: fixture.home,
        away: fixture.away,
        competition: fixture.league,
        kickoff: fixture.kickoff,
        status: "scheduled",
        url,
        embeddable: embedFor(url)?.kind !== "link",
        confidence: 1,
      },
    ]
  },
}
