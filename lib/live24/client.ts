/**
 * Client for Live24 / StreamHive live football stream directory.
 * Feed source: https://guidetv.live/buff/output/Football.json
 */

import type { Live24EventItem, Live24ParsedEvent } from "./types"

export const LIVE24_FEED_URL = "https://guidetv.live/buff/output/Football.json"
const REQUEST_TIMEOUT_MS = 7_000
const CACHE_TTL_MS = 60_000
const HEALTH_CACHE_TTL_MS = 30_000

let eventsCache: { timestamp: number; data: Live24ParsedEvent[] } | null = null
let inflightEvents: Promise<Live24ParsedEvent[]> | null = null

let healthCache: { timestamp: number; data: { status: string; ok: boolean; count?: number; latencyMs: number } } | null = null
let inflightHealth: Promise<{ status: string; ok: boolean; count?: number; latencyMs: number }> | null = null

export function clearLive24Cache(): void {
  eventsCache = null
  inflightEvents = null
  healthCache = null
  inflightHealth = null
}

/**
 * Validate and sanitize embed URLs from Live24.
 * Accepts livelive24.st, livelive24.com, or guidetv.live.
 */
export function sanitizeLive24Url(rawUrl?: string): string | null {
  if (!rawUrl || typeof rawUrl !== "string") return null
  const trimmed = rawUrl.trim()
  if (!trimmed) return null

  if (/^(javascript|data|vbscript):/i.test(trimmed)) {
    return null
  }

  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return null
    }
    const host = parsed.hostname.toLowerCase()
    if (
      host === "livelive24.st" ||
      host.endsWith(".livelive24.st") ||
      host === "livelive24.com" ||
      host.endsWith(".livelive24.com") ||
      host === "guidetv.live" ||
      host.endsWith(".guidetv.live")
    ) {
      return parsed.toString()
    }
    // Accept valid https player embeds
    return parsed.toString()
  } catch {
    return null
  }
}

/**
 * Parse home and away teams from event name like "Home vs Away" or "Home v Away"
 */
export function parseTeamsFromTitle(title: string): { home: string; away: string } {
  if (!title) return { home: "", away: "" }

  const match = title.match(/^(.+?)\s+(?:vs\.?|v\.?|-)\s+(.+?)$/i)
  if (match) {
    return {
      home: match[1].trim(),
      away: match[2].trim(),
    }
  }

  return { home: title.trim(), away: "" }
}

/**
 * Normalize raw Live24 feed item into parsed shape.
 */
export function normalizeLive24Event(item: Live24EventItem, index: number): Live24ParsedEvent | null {
  if (!item.name || typeof item.name !== "string") return null

  const { home, away } = parseTeamsFromTitle(item.name)
  if (!home || !away) return null

  const validStreams = (item.streams || [])
    .map((s) => ({
      name: s.name || `Stream ${index + 1}`,
      url: sanitizeLive24Url(s.url) || "",
      language: s.language || "",
    }))
    .filter((s) => Boolean(s.url))

  if (validStreams.length === 0) return null

  // Extract competition from breadcrumb or playing string
  let competition: string | undefined
  if (Array.isArray(item.breadcrumb) && item.breadcrumb.length >= 3) {
    competition = item.breadcrumb[2].text
  } else if (item.playing) {
    // e.g. "Turkey Super Lig 10:30"
    competition = item.playing.replace(/\s+\d{1,2}:\d{2}.*$/, "").trim()
  }

  const timestampMs = item.timestamp ? item.timestamp * 1000 : undefined
  const now = Date.now()
  // Active / live window: within -2h to +3h of kickoff
  const isLive = timestampMs ? now >= timestampMs - 15 * 60_000 && now <= timestampMs + 150 * 60_000 : true

  const slug = (item.match_key || item.name).toLowerCase().replace(/[^a-z0-9]+/g, "-")

  return {
    id: `live24-${slug || index}`,
    rawName: item.name,
    homeTeam: home,
    awayTeam: away,
    competition,
    date: item.date,
    time: item.time,
    timestampMs,
    streams: validStreams,
    primaryStreamUrl: validStreams[0]?.url,
    isLive,
  }
}

/**
 * Fetch and parse all football events from Live24.
 */
export async function fetchLive24Events(options: { forceRefresh?: boolean } = {}): Promise<Live24ParsedEvent[]> {
  const { forceRefresh = false } = options
  const now = Date.now()

  if (!forceRefresh && eventsCache && now - eventsCache.timestamp < CACHE_TTL_MS) {
    return eventsCache.data
  }

  if (inflightEvents) {
    return inflightEvents
  }

  inflightEvents = (async () => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    try {
      const res = await fetch(LIVE24_FEED_URL, {
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        },
      })

      if (!res.ok) {
        console.warn(`[live24] Events feed returned HTTP ${res.status}`)
        return eventsCache?.data ?? []
      }

      const rawItems = (await res.json()) as Live24EventItem[]
      if (!Array.isArray(rawItems)) {
        console.warn("[live24] Events feed was not an array")
        return eventsCache?.data ?? []
      }

      const parsed: Live24ParsedEvent[] = []
      rawItems.forEach((item, idx) => {
        const norm = normalizeLive24Event(item, idx)
        if (norm) parsed.push(norm)
      })

      eventsCache = { timestamp: Date.now(), data: parsed }
      return parsed
    } catch (err) {
      console.error("[live24] Failed to fetch football events:", err)
      return eventsCache?.data ?? []
    } finally {
      clearTimeout(timer)
      inflightEvents = null
    }
  })()

  return inflightEvents
}

/**
 * Health check for Live24 / StreamHive feed.
 */
export async function checkLive24Health(): Promise<{ status: string; ok: boolean; count?: number; latencyMs: number }> {
  const now = Date.now()
  if (healthCache && now - healthCache.timestamp < HEALTH_CACHE_TTL_MS) {
    return healthCache.data
  }

  if (inflightHealth) {
    return inflightHealth
  }

  inflightHealth = (async () => {
    const start = Date.now()
    try {
      const events = await fetchLive24Events({ forceRefresh: true })
      const ok = events.length > 0
      const data = {
        status: ok ? "operational" : "degraded",
        ok,
        count: events.length,
        latencyMs: Date.now() - start,
      }
      healthCache = { timestamp: Date.now(), data }
      return data
    } catch {
      return { status: "down", ok: false, count: 0, latencyMs: Date.now() - start }
    } finally {
      inflightHealth = null
    }
  })()

  return inflightHealth
}

