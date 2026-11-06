/**
 * DAMITV (OnDemand) API types and data models.
 * Base URL: https://ondemand.st/papi/api
 */

export type DamiTvSource = {
  source?: string
  id: string
  name: string
  sd?: number // 0 or 1
  hd?: number // 0 or 1
  embed: string
}

export type DamiTvTeam = {
  name: string
  badge?: string
}

export type DamiTvStreamItem = {
  id: string
  name: string
  poster?: string
  starts_at?: number // Unix epoch in seconds
  ends_at?: number // Unix epoch in seconds
  category_name?: string
  status: "live" | "upcoming" | string
  league?: string
  teams?: {
    home?: DamiTvTeam
    away?: DamiTvTeam
  }
  viewers?: number
  always_live?: number
  sources?: DamiTvSource[]
  embed?: string
}

export type DamiTvCategoryGroup = {
  category: string
  id: number | string
  streams: DamiTvStreamItem[]
}

export type DamiTvApiResponse = {
  success?: boolean
  timestamp?: number
  performance?: number
  READ_ME?: string
  streams?: DamiTvCategoryGroup[]
}

export type DamiTvParsedStream = {
  id: string
  name: string
  home: string
  away: string
  league: string
  status: "LIVE" | "UPCOMING" | "OFFLINE"
  isLive: boolean
  startsAt: number // seconds
  endsAt: number // seconds
  kickoffIso: string | null
  poster?: string
  viewers?: number
  embedUrl: string
  sources: DamiTvSource[]
}

export type MatchedDamiTv = {
  stream: DamiTvParsedStream
  confidence: number
  isConfirmedMatch: boolean
  activeSource?: DamiTvSource
}
