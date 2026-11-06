/**
 * ZLive API types and data models.
 * Manifest endpoint: https://zlive.st/embed/manifest.json
 */

export type ZLiveChannel = {
  id: string
  name: string
  region?: string
  flag?: string
  quality?: string // "FHD" | "HD" | "SD" | string
  sport?: string
  live: boolean
  url: string
}

export type ZLiveManifest = {
  name: string
  version: number
  variant?: string
  generatedAt?: string
  baseUrl: string
  count: number
  channels: ZLiveChannel[]
}

export type MatchedZLive = {
  channel: ZLiveChannel
  confidence: number
  isConfirmedMatch: boolean
  isGenericBroadcaster: boolean
}
