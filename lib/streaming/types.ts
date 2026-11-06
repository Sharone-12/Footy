/**
 * Unified multi-provider streaming types.
 * Normalizes streams across StreamFree, ZLive, and future providers.
 */

export type StreamingProviderId = "streamfree" | "zlive" | "daddylive"

export type NormalizedQualityVariant = {
  quality: string // "4K" | "FHD" | "HD" | "SD" | string
  url: string
  live: boolean
}

export type NormalizedStreamSource = {
  provider: StreamingProviderId
  id: string
  name: string
  sport: string
  quality: string
  live: boolean
  embedUrl: string
  qualities?: NormalizedQualityVariant[]
  isGenericChannel?: boolean
  region?: string
  confidence?: number
}

export type NormalizedFixtureStreams = {
  eventId: number
  fixtureTitle: string
  league: string
  kickoff?: string | null
  sources: NormalizedStreamSource[]
}

