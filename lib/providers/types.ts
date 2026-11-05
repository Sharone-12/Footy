/**
 * Shared shapes for provider discovery.
 *
 * An adapter's job is to turn one of our fixtures into candidate event pages
 * on its own site. Whether a candidate can actually be framed is decided in
 * one place — `embedFor` in lib/stream-embed.ts — so adapters return the page
 * URL and never their own embed logic.
 */

/** A fixture as the `matches` table stores it. */
export type Fixture = {
  event_id: number
  home: string
  away: string
  league: string
  /** UTC instant, or null when Sofascore only gave us the day. */
  kickoff: string | null
  date: string
}

export type Availability =
  /** At least one event matched above the confidence threshold. */
  | "available"
  /** Provider answered, nothing matched this fixture. */
  | "unavailable"
  /** Provider publishes no documented listing API, so it is never called. */
  | "unsupported"
  /** Provider was called and failed: timeout, network, bad status. */
  | "error"
  /** Provider exists in the registry but its credentials are not configured. */
  | "unconfigured"

/** The normalised event every adapter returns. */
export type DiscoveredEvent = {
  provider: string
  /** The provider's own id for the event. */
  eventId: string
  home: string
  away: string
  competition: string
  kickoff: string | null
  /** The provider's event status, normalised. */
  status: "scheduled" | "live" | "ended" | "unknown"
  /** The event page URL. The UI runs `embedFor` on this. */
  url: string
  /** Whether `embedFor` resolves `url` to a real player rather than a link. */
  embeddable: boolean
  confidence: number
}

/** One provider's slice of a discovery run. */
export type ProviderResult = {
  provider: string
  availability: Availability
  events: DiscoveredEvent[]
  /** Set when availability is "error"; safe to show, never a credential. */
  error?: string
}

export type DiscoveryResult = {
  event_id: number
  /** Milliseconds the whole fan-out took, for the log line. */
  tookMs: number
  providers: ProviderResult[]
}

export type ProviderAdapter = {
  name: string
  /** Configured once, in the registry — adapters never hardcode a host. */
  baseUrl: string
  /**
   * Resolve candidates for a fixture. Throws on transport failure; the
   * orchestrator catches, retries once and isolates the provider.
   */
  discover(fixture: Fixture, signal: AbortSignal): Promise<DiscoveredEvent[]>
}

export type ProviderEntry = {
  adapter: ProviderAdapter
  /**
   * False when the site publishes no documented listing API. Listed on the
   * page as unsupported and never fetched — we do not scrape HTML listings
   * or work around anti-bot protection to find a stream.
   */
  supported: boolean
  /** False when required credentials are absent from the environment. */
  configured: boolean
}
