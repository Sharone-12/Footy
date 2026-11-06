/**
 * StreamFree API types and data models.
 * Base URL: https://streamfree.top
 */

export type StreamFreeQuality = "4K" | "FHD" | "HD" | "SD" | string

export type StreamFreeSource = {
  quality: StreamFreeQuality
  url: string
  live: boolean
}

export type StreamFreeItem = {
  id?: string
  name: string
  category: string
  league: string
  stream_key: string
  match_timestamp: number // Unix epoch in seconds
  viewers?: number
  is_external?: boolean
  thumbnail_url?: string
  sources: StreamFreeSource[]
  team1?: {
    name: string
    logo?: string
  }
  team2?: {
    name: string
    logo?: string
  }
}

export type StreamFreeResponse = {
  count?: number
  streams?: StreamFreeItem[]
}

export type StreamStatus = "LIVE" | "UPCOMING" | "OFFLINE"

export type MatchedStream = {
  streamKey: string
  title: string
  league: string
  matchTimestamp: number
  status: StreamStatus
  isLive: boolean
  availableQualities: StreamFreeQuality[]
  sources: StreamFreeSource[]
  bestSource: StreamFreeSource | null
  thumbnailUrl?: string
  confidence: number
  matchedTeams: {
    home: string
    away: string
  }
}

