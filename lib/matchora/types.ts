export interface MatchoraRawChannel {
  id: string | number
  name: string
  country?: string
  quality?: string
  lang?: string
  watching?: number
  playing?: boolean
  dead?: boolean
  embed_url: string
}

export interface MatchoraRawEvent {
  id: string | number
  home: string
  away: string
  league: string
  sport?: string
  watching?: number
  home_badge?: string
  away_badge?: string
  league_badge?: string
  kickoff: number // Unix timestamp in seconds
  status?: string // e.g. "NS", "1H", "HT", "2H", "FT"
  minute?: string | number | null
  score?: string | null
  live?: boolean
  finished?: boolean
  channel_count?: number
  channels?: MatchoraRawChannel[]
  page_url?: string
  embed_url: string
}

export interface MatchoraApiResponse {
  count?: number
  events?: MatchoraRawEvent[]
}

export interface MatchoraParsedChannel {
  id: string
  name: string
  country?: string
  quality?: string
  lang?: string
  embedUrl: string
}

export interface MatchoraParsedEvent {
  id: string
  home: string
  away: string
  league: string
  sport: string
  kickoff: number // milliseconds
  dateIso: string // YYYY-MM-DD
  status: "live" | "upcoming" | "finished"
  minute?: string | null
  score?: string | null
  channelCount: number
  channels: MatchoraParsedChannel[]
  pageUrl?: string
  embedUrl: string
}

export interface MatchedMatchora {
  confidence: number // 0 to 100
  event: MatchoraParsedEvent
  channel?: MatchoraParsedChannel
}
