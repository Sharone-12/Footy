/**
 * DaddyLiveHD API types and data models.
 * Base URL: https://thedaddy.li
 */

export type DaddyLiveRawChannel = {
  channel_name: string
  channel_id: string | number
  logo_url?: string | null
}

export type DaddyLiveChannelsResponse = {
  success?: boolean
  count?: number
  data?: DaddyLiveRawChannel[]
  error?: string
  message?: string
}

export type DaddyLiveChannel = {
  channel_id: string
  channel_name: string
  logo_url?: string
  player_url: string
}

export type DaddyLiveScheduleChannel = {
  channel_name: string
  channel_id: string
  logo_url?: string
}

export type DaddyLiveScheduleEvent = {
  time: string // e.g. "19:30" UK time
  event: string // e.g. "Barcelona vs Real Madrid"
  channels: DaddyLiveScheduleChannel[]
  channels2?: DaddyLiveScheduleChannel[]
}

export type DaddyLiveRawSchedule = Record<string, Record<string, DaddyLiveScheduleEvent[]>>

export type DaddyLiveParsedEvent = {
  id: string
  rawTitle: string
  home: string
  away: string
  timeStr: string // "19:30"
  kickoffIso: string | null
  channels: DaddyLiveChannel[]
}

export type MatchedDaddyLive = {
  event: DaddyLiveParsedEvent
  confidence: number
  isConfirmedMatch: boolean
  channels: DaddyLiveChannel[]
}

