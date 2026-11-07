import https from "node:https"
import type {
  DaddyLiveChannel,
  DaddyLiveChannelsResponse,
  DaddyLiveParsedEvent,
  DaddyLiveRawSchedule,
  DaddyLiveScheduleChannel,
} from "./types"
import { getDaddyLivePlayerUrl, normalizeDaddyLiveLogo } from "./urls"

const API_BASE = "https://thedaddy.li/daddyapi.php"
const TIMEOUT_MS = 15_000

const DEFAULT_BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

// Caching configuration
const CHANNELS_CACHE_TTL_MS = 15 * 60_000 // 15 minutes
const SCHEDULE_CACHE_TTL_MS = 60_000 // 60 seconds
const INFO_CACHE_TTL_MS = 30 * 60_000 // 30 minutes

let channelsCache: { timestamp: number; data: DaddyLiveChannel[] } | null = null
let inflightChannels: Promise<DaddyLiveChannel[]> | null = null

let scheduleCache: { timestamp: number; data: DaddyLiveParsedEvent[] } | null = null
let inflightSchedule: Promise<DaddyLiveParsedEvent[]> | null = null

let infoCache: { timestamp: number; data: Record<string, unknown> } | null = null
let inflightInfo: Promise<Record<string, unknown> | null> | null = null

function getApiKey(): string | undefined {
  return (
    process.env.DADDYLIVE_API_KEY?.trim() ||
    process.env.daddylive_api_key?.trim() ||
    process.env["daddylive-api-key"]?.trim() ||
    process.env.Daddylive_Api_Key?.trim()
  )
}

/**
 * Fetch and parse all DaddyLive channels.
 * Cached for ~15 minutes with in-flight deduplication and timeout protection.
 */
export async function fetchDaddyLiveChannels(forceRefresh = false): Promise<DaddyLiveChannel[]> {
  const now = Date.now()
  if (!forceRefresh && channelsCache && now - channelsCache.timestamp < CHANNELS_CACHE_TTL_MS) {
    return channelsCache.data
  }

  if (inflightChannels) {
    return inflightChannels
  }

  inflightChannels = (async () => {
    const apiKey = getApiKey()
    if (!apiKey) {
      console.warn("[daddylive] DADDYLIVE_API_KEY environment variable is not configured")
      return channelsCache?.data ?? []
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    try {
      const url = `${API_BASE}?key=${encodeURIComponent(apiKey)}&endpoint=channels`
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "User-Agent": DEFAULT_BROWSER_UA,
        },
      })

      if (!res.ok) {
        console.warn(`[daddylive] Channels fetch failed with status ${res.status}`)
        return channelsCache?.data ?? []
      }

      const json = (await res.json()) as DaddyLiveChannelsResponse
      const rawList = json?.data || []
      if (!Array.isArray(rawList)) {
        console.warn("[daddylive] Channels response payload missing data array")
        return channelsCache?.data ?? []
      }

      // Deduplicate by channel_id and parse
      const map = new Map<string, DaddyLiveChannel>()
      for (const item of rawList) {
        if (!item.channel_id) continue
        const chId = String(item.channel_id).trim()
        if (map.has(chId)) continue

        map.set(chId, {
          channel_id: chId,
          channel_name: item.channel_name || `Channel ${chId}`,
          logo_url: normalizeDaddyLiveLogo(item.logo_url),
          player_url: getDaddyLivePlayerUrl(chId),
        })
      }

      const result = Array.from(map.values())
      channelsCache = { timestamp: Date.now(), data: result }
      return result
    } catch (err: unknown) {
      const isAbort = err instanceof Error && err.name === "AbortError"
      console.warn(`[daddylive] Channels fetch error (${isAbort ? "timeout" : String(err)})`)
      return channelsCache?.data ?? []
    } finally {
      clearTimeout(timer)
      inflightChannels = null
    }
  })()

  return inflightChannels
}

/**
 * Determine the calendar date for a dynamic schedule day header.
 * Handles "Today", "Tomorrow", weekday names ("Saturday", "Sunday"), and ISO date strings.
 */
export function resolveScheduleDate(dayKey: string, baseDate = new Date()): string {
  const norm = dayKey.trim().toLowerCase()
  const d = new Date(baseDate)

  if (norm === "today") {
    return d.toISOString().slice(0, 10)
  }
  if (norm === "tomorrow") {
    d.setUTCDate(d.getUTCDate() + 1)
    return d.toISOString().slice(0, 10)
  }
  if (norm === "yesterday") {
    d.setUTCDate(d.getUTCDate() - 1)
    return d.toISOString().slice(0, 10)
  }

  // Check if standard date string YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(norm)) {
    return norm
  }

  // Check weekday name
  const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
  const targetDayIdx = weekdays.indexOf(norm)
  if (targetDayIdx !== -1) {
    const currentDayIdx = d.getUTCDay()
    let diff = targetDayIdx - currentDayIdx
    if (diff < 0) diff += 7
    d.setUTCDate(d.getUTCDate() + diff)
    return d.toISOString().slice(0, 10)
  }

  // Fallback: use today's date
  return d.toISOString().slice(0, 10)
}

/**
 * Convert a UK schedule time ("19:30") and date into an ISO UTC timestamp.
 * In the UK:
 *   - GMT (UTC+0) runs from late October to late March.
 *   - BST (UTC+1) runs from late March to late October.
 */
export function resolveUkTime(dateStr: string, timeStr: string): string | null {
  const m = timeStr.trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return null

  const hours = Number(m[1])
  const minutes = Number(m[2])
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null

  // Check if date falls in British Summer Time (BST, UTC+1)
  // Simple check: April through September is BST; November through February is GMT
  const month = Number(dateStr.slice(5, 7))
  const isSummer = month >= 4 && month <= 9
  // Subtract 1 hour for BST to get UTC, or 0 for GMT
  const offsetHours = isSummer ? 1 : 0

  const d = new Date(`${dateStr}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00Z`)
  if (Number.isNaN(d.getTime())) return null

  d.setUTCHours(d.getUTCHours() - offsetHours)
  return d.toISOString()
}

/**
 * Parse home and away teams from an event title (e.g. "Barcelona vs Real Madrid", "Arsenal - Chelsea").
 */
export function parseEventTeams(eventTitle: string): { home: string; away: string } {
  const clean = eventTitle.trim()
  const m = clean.match(/^(.+?)\s+(?:vs\.?|v|-)\s+(.+?)$/i)
  if (m) {
    return {
      home: m[1].trim(),
      away: m[2].trim(),
    }
  }
  return { home: clean, away: "" }
}

/**
 * Merge and deduplicate schedule channel lists.
 */
function mergeScheduleChannels(
  primary?: DaddyLiveScheduleChannel[],
  secondary?: DaddyLiveScheduleChannel[],
): DaddyLiveChannel[] {
  const map = new Map<string, DaddyLiveChannel>()
  const combined = [...(primary || []), ...(secondary || [])]

  for (const item of combined) {
    if (!item.channel_id) continue
    const chId = String(item.channel_id).trim()
    if (map.has(chId)) continue

    map.set(chId, {
      channel_id: chId,
      channel_name: item.channel_name || `Channel ${chId}`,
      logo_url: normalizeDaddyLiveLogo(item.logo_url),
      player_url: getDaddyLivePlayerUrl(chId),
    })
  }

  return Array.from(map.values())
}

/**
 * Fetches live events from the free public DaddyLive JSON API:
 * GET https://daddylive.mov/api/events
 */
function fetchPublicEventsJson(): Promise<{ categories?: Record<string, any[]>; total_events?: number } | null> {
  return new Promise((resolve) => {
    const req = https.get(
      {
        hostname: "daddylive.mov",
        path: "/api/events",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          Accept: "application/json",
          Referer: "https://daddylive.mov/",
        },
        servername: "daddylive.mov",
        timeout: TIMEOUT_MS,
      },
      (res) => {
        if (res.statusCode !== 200) {
          resolve(null)
          return
        }
        let data = ""
        res.on("data", (chunk) => (data += chunk))
        res.on("end", () => {
          try {
            resolve(JSON.parse(data))
          } catch {
            resolve(null)
          }
        })
      },
    )
    req.on("error", () => resolve(null))
    req.on("timeout", () => {
      req.destroy()
      resolve(null)
    })
  })
}

/**
 * Fetch and parse DaddyLive football schedule.
 * Prioritizes the free public https://daddylive.mov/api/events endpoint,
 * and falls back to the legacy authenticated endpoint if an API key is present.
 * Cached for ~60s with in-flight deduplication.
 */
export async function fetchDaddyLiveSchedule(forceRefresh = false): Promise<DaddyLiveParsedEvent[]> {
  const now = Date.now()
  if (!forceRefresh && scheduleCache && now - scheduleCache.timestamp < SCHEDULE_CACHE_TTL_MS) {
    return scheduleCache.data
  }

  if (inflightSchedule) {
    return inflightSchedule
  }

  inflightSchedule = (async () => {
    // 1. Try free public endpoint first (https://daddylive.mov/api/events)
    try {
      const publicData = await fetchPublicEventsJson()
      if (publicData && publicData.categories && typeof publicData.categories === "object") {
        const eventMap = new Map<string, DaddyLiveParsedEvent>()

        for (const [catName, events] of Object.entries(publicData.categories)) {
          if (!Array.isArray(events)) continue
          const isSoccerCat = /soccer|football/i.test(catName)

          for (const ev of events) {
            if (!ev || !ev.event || !Array.isArray(ev.channels) || ev.channels.length === 0) continue

            // Filter out non-football sports
            if (!isSoccerCat) {
              const evLower = ev.event.toLowerCase()
              if (!evLower.includes("soccer") && !evLower.includes("football") && !evLower.includes("league")) {
                if (/cricket|nba|nfl|ncaaf|golf|motogp|ufc|boxing|tennis|hockey|rugby/i.test(evLower)) {
                  continue
                }
              }
            }

            const cleanTitle = ev.event.replace(/^[⚽🏎️🏏🥊\s]+/, "").trim()
            const { home, away } = parseEventTeams(cleanTitle)
            if (!home || !away) continue

            const normKey = `${home.toLowerCase().replace(/[^a-z0-9]+/g, "")}_${away.toLowerCase().replace(/[^a-z0-9]+/g, "")}`
            const newChannels: DaddyLiveChannel[] = ev.channels
              .filter((c: any) => c && c.url)
              .map((c: any, i: number) => ({
                channel_id: c.url,
                channel_name: c.channel_name || `Link - ${i + 1}`,
                player_url: c.url,
              }))

            if (newChannels.length === 0) continue

            if (eventMap.has(normKey)) {
              const existing = eventMap.get(normKey)!
              for (const nc of newChannels) {
                if (!existing.channels.some((c) => c.player_url === nc.player_url)) {
                  existing.channels.push(nc)
                }
              }
            } else {
              eventMap.set(normKey, {
                id: `daddylive:${ev.source || "mov"}:${normKey}`,
                rawTitle: cleanTitle,
                home,
                away,
                timeStr: ev.time || "Live",
                kickoffIso: new Date().toISOString(),
                channels: newChannels,
              })
            }
          }
        }

        const parsedPublic = Array.from(eventMap.values())
        if (parsedPublic.length > 0) {
          scheduleCache = { timestamp: Date.now(), data: parsedPublic }
          return parsedPublic
        }
      }
    } catch (pubErr) {
      console.warn("[daddylive] Public api/events fetch failed, falling back to legacy api:", pubErr)
    }

    // 2. Fall back to legacy authenticated endpoint if an API key is configured
    const apiKey = getApiKey()
    if (!apiKey) {
      return scheduleCache?.data ?? []
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    try {
      const url = `${API_BASE}?key=${encodeURIComponent(apiKey)}&endpoint=schedule`
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "User-Agent": DEFAULT_BROWSER_UA,
        },
      })

      if (!res.ok) {
        console.warn(`[daddylive] Schedule fetch failed with status ${res.status}`)
        return scheduleCache?.data ?? []
      }

      const rawSchedule = (await res.json()) as DaddyLiveRawSchedule
      if (!rawSchedule || typeof rawSchedule !== "object") {
        console.warn("[daddylive] Invalid schedule response format")
        return scheduleCache?.data ?? []
      }

      const parsedEvents: DaddyLiveParsedEvent[] = []

      // 1. Iterate day keys dynamically ("Today", "Tomorrow", "Saturday", date strings, etc.)
      for (const [dayKey, dayCategories] of Object.entries(rawSchedule)) {
        if (!dayCategories || typeof dayCategories !== "object") continue
        const dateStr = resolveScheduleDate(dayKey)

        // 2. Iterate category keys dynamically
        for (const [categoryKey, events] of Object.entries(dayCategories)) {
          // Filter for football / soccer categories
          if (!/football|soccer/i.test(categoryKey)) continue
          if (!Array.isArray(events)) continue

          for (const ev of events) {
            if (!ev.event || !ev.time) continue
            const { home, away } = parseEventTeams(ev.event)
            const channels = mergeScheduleChannels(ev.channels, ev.channels2)
            if (channels.length === 0) continue

            const kickoffIso = resolveUkTime(dateStr, ev.time)
            const eventId = `${dateStr}:${ev.time}:${ev.event.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`

            parsedEvents.push({
              id: eventId,
              rawTitle: ev.event,
              home,
              away,
              timeStr: ev.time,
              kickoffIso,
              channels,
            })
          }
        }
      }

      scheduleCache = { timestamp: Date.now(), data: parsedEvents }
      return parsedEvents
    } catch (err: unknown) {
      const isAbort = err instanceof Error && err.name === "AbortError"
      console.warn(`[daddylive] Schedule fetch error (${isAbort ? "timeout" : String(err)})`)
      return scheduleCache?.data ?? []
    } finally {
      clearTimeout(timer)
      inflightSchedule = null
    }
  })()

  return inflightSchedule
}

/**
 * Fetch DaddyLive API status/info endpoint.
 * Cached for ~30 minutes.
 */
export async function fetchDaddyLiveInfo(): Promise<Record<string, unknown> | null> {
  const now = Date.now()
  if (infoCache && now - infoCache.timestamp < INFO_CACHE_TTL_MS) {
    return infoCache.data
  }

  if (inflightInfo) {
    return inflightInfo
  }

  inflightInfo = (async () => {
    const apiKey = getApiKey()
    if (!apiKey) return null

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    try {
      const url = `${API_BASE}?key=${encodeURIComponent(apiKey)}&endpoint=info`
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      })
      if (!res.ok) return null
      const data = (await res.json()) as Record<string, unknown>
      infoCache = { timestamp: Date.now(), data }
      return data
    } catch {
      return null
    } finally {
      clearTimeout(timer)
      inflightInfo = null
    }
  })()

  return inflightInfo
}

export async function checkDaddyLiveHealth(): Promise<{ ok: boolean; count?: number; latencyMs: number }> {
  const start = Date.now()
  try {
    const events = await fetchDaddyLiveSchedule()
    return {
      ok: true,
      count: events.length,
      latencyMs: Date.now() - start,
    }
  } catch {
    return {
      ok: false,
      latencyMs: Date.now() - start,
    }
  }
}

/** Testing helper to clear cache */
export function _clearDaddyLiveCache(): void {
  channelsCache = null
  inflightChannels = null
  scheduleCache = null
  inflightSchedule = null
  infoCache = null
  inflightInfo = null
}

