/**
 * Type definitions for Live24 / StreamHive streaming provider.
 * Feeds from https://guidetv.live/buff/output/Football.json
 * Embeds hosted at https://livelive24.st/live24.html?url=...
 */

export interface Live24StreamSource {
  name: string
  url: string
  language?: string
}

export interface Live24Breadcrumb {
  text: string
  href: string
}

export interface Live24EventItem {
  name: string
  category: string
  image?: string
  playing?: string
  page?: string
  date?: string
  time?: string
  timestamp?: number // Unix seconds
  streams: Live24StreamSource[]
  match_key?: string
  is_big_event?: boolean
  is_pinned?: boolean
  breadcrumb?: Live24Breadcrumb[]
  importance?: number
}

export interface Live24ParsedEvent {
  id: string
  rawName: string
  homeTeam: string
  awayTeam: string
  competition?: string
  date?: string
  time?: string
  timestampMs?: number
  streams: Live24StreamSource[]
  primaryStreamUrl?: string
  isLive: boolean
}

export interface MatchedLive24 {
  event_id: number
  fixture: {
    home: string
    away: string
    league: string
    date?: string
  }
  event: Live24ParsedEvent
  isConfirmedMatch: boolean
  matchConfidence: number
}
