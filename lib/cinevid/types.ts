/**
 * Type definitions for Cinevid streaming provider integration.
 * Public API: https://cinevid.st/api/public/events
 */

export type CinevidSport = "Football" | "Soccer" | string

export type CinevidRawStatus = "NS" | "Live" | "Finished" | "Ended" | string

export type CinevidStatus = "UPCOMING" | "LIVE" | "FINISHED"

/** Raw event returned by GET https://cinevid.st/api/public/events */
export type CinevidRawEvent = {
  id: string
  slug: string
  title: string
  sport: string
  league: string | null
  date: string // "YYYY-MM-DD" (UTC)
  time: string // "HH:mm" (UTC)
  status: CinevidRawStatus
  score: string | null
  round: string | null
  venue: string | null
  homeTeamImage: string | null
  awayTeamImage: string | null
  thumbnail: string | null
  playerUrl: string | null
}

export type CinevidApiResponse = {
  count: number
  events: CinevidRawEvent[]
}

/** Parsed and normalized Cinevid event for football streaming */
export type CinevidParsedEvent = {
  id: string
  slug: string
  title: string
  sport: string
  home: string
  away: string
  league: string | null
  utcDate: string // "YYYY-MM-DD"
  utcTime: string // "HH:mm"
  kickoffIso: string // Full ISO string in UTC
  kickoffTimestampMs: number // Epoch milliseconds
  status: CinevidStatus
  isLive: boolean
  score: string | null
  round: string | null
  venue: string | null
  homeTeamImage: string | null
  awayTeamImage: string | null
  thumbnail: string | null
  playerUrl: string
}

/** Result of matching a SofaScore fixture to a Cinevid event */
export type MatchedCinevid = {
  event_id?: number
  fixtureId?: number
  isConfirmedMatch: boolean
  confidence: number // 0 - 100
  event: CinevidParsedEvent
}

