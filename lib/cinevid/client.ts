/**
 * Dedicated client and service for Cinevid streaming provider.
 * Public API: https://cinevid.st/api/public/events
 */

import type {
  CinevidApiResponse,
  CinevidParsedEvent,
  CinevidRawEvent,
  CinevidStatus,
} from "./types"

export const CINEVID_BASE_URL = "https://cinevid.st"
const EVENTS_CACHE_TTL_MS = 60_000 // 60 seconds
const HEALTH_CACHE_TTL_MS = 30_000 // 30 seconds
const REQUEST_TIMEOUT_MS = 16_000 // 16 seconds (Cinevid API can take 8-12s under peak load)

const DEFAULT_HEADERS = {
  Accept: "application/json",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
}

let eventsCache: { timestamp: number; data: CinevidParsedEvent[] } | null = null
let inflightEvents: Promise<CinevidParsedEvent[]> | null = null

let healthCache: { timestamp: number; data: { status: string; ok: boolean; count?: number; latencyMs: number } } | null = null
let inflightHealth: Promise<{ status: string; ok: boolean; count?: number; latencyMs: number }> | null = null

/**
 * Validates and normalizes relative or absolute URLs from Cinevid.
 * Only permits trusted Cinevid origins (or relative paths starting with '/').
 * Rejects arbitrary external hosts or insecure protocols (e.g. javascript:).
 */
export function resolveCinevidUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl || typeof rawUrl !== "string") return null
  const trimmed = rawUrl.trim()
  if (!trimmed) return null

  // Reject malicious schemes
  if (/^(javascript|data|vbscript):/i.test(trimmed)) {
    return null
  }

  // Relative path starting with '/'
  if (trimmed.startsWith("/")) {
    return `${CINEVID_BASE_URL}${trimmed}`
  }

  // Absolute URL: verify host matches cinevid.st
  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return null
    }
    const host = parsed.hostname.toLowerCase()
    if (host === "cinevid.st" || host.endsWith(".cinevid.st")) {
      return parsed.toString()
    }
    // Reject untrusted origin
    return null
  } catch {
    return null
  }
}

/**
 * Normalize provider status into FOOTYY canonical status:
 * "NS" -> "UPCOMING", "Live" -> "LIVE", "Finished" / "Ended" -> "FINISHED"
 */
export function normalizeCinevidStatus(rawStatus: string | null | undefined): CinevidStatus {
  if (!rawStatus) return "UPCOMING"
  const s = rawStatus.trim().toLowerCase()
  if (s === "live") return "LIVE"
  if (s === "finished" || s === "ended") return "FINISHED"
  return "UPCOMING"
}

/**
 * Checks whether an event belongs to football/soccer.
 * Case-insensitive match, strictly rejecting "american football" or other sports.
 */
export function isFootballSport(sport: string | null | undefined): boolean {
  if (!sport) return false
  const s = sport.trim().toLowerCase()
  if (s.includes("american")) return false
  return s === "football" || s === "soccer"
}

/**
 * Extract home and away team names from the event title.
 * Formats: "Team A vs Team B", "Team A v Team B", "Team A - Team B"
 */
export function parseCinevidTeams(title: string): { home: string; away: string } {
  if (!title) return { home: "", away: "" }

  const match = title.match(/^(.+?)\s+(?:vs\.?|v|-)\s+(.+?)$/i)
  if (match) {
    return {
      home: match[1].trim(),
      away: match[2].trim(),
    }
  }

  return { home: title.trim(), away: "" }
}

/**
 * Parses and normalizes a raw Cinevid event.
 * Rejects non-football events or events with invalid player URLs.
 */
export function normalizeCinevidEvent(raw: CinevidRawEvent): CinevidParsedEvent | null {
  if (!raw || !raw.id) return null

  // 1. Strictly filter football events
  if (!isFootballSport(raw.sport)) {
    return null
  }

  // 2. Validate and resolve playerUrl
  const playerUrl = resolveCinevidUrl(raw.playerUrl)
  if (!playerUrl) {
    return null
  }

  // 3. Normalize team names
  const { home, away } = parseCinevidTeams(raw.title || "")
  if (!home || !away) {
    return null
  }

  // 4. Normalize images
  const homeTeamImage = resolveCinevidUrl(raw.homeTeamImage)
  const awayTeamImage = resolveCinevidUrl(raw.awayTeamImage)
  const thumbnail = resolveCinevidUrl(raw.thumbnail)

  // 5. Parse UTC Date and Time
  // Format: "YYYY-MM-DD" and "HH:mm" in UTC
  const dateStr = (raw.date || "").trim()
  const timeStr = (raw.time || "00:00").trim()
  const timeFormatted = timeStr.length === 5 ? timeStr : `${timeStr.padStart(5, "0")}`
  const isoCandidate = `${dateStr}T${timeFormatted}:00.000Z`
  const kickoffMs = new Date(isoCandidate).getTime()
  const validTimestamp = !Number.isNaN(kickoffMs) ? kickoffMs : 0
  const kickoffIso = validTimestamp ? new Date(validTimestamp).toISOString() : isoCandidate

  // 6. Normalize status
  const status = normalizeCinevidStatus(raw.status)
  const isLive = status === "LIVE"

  return {
    id: String(raw.id).trim(),
    slug: (raw.slug || "").trim(),
    title: (raw.title || "").trim(),
    sport: "Football",
    home,
    away,
    league: raw.league ? raw.league.trim() : null,
    utcDate: dateStr,
    utcTime: timeStr,
    kickoffIso,
    kickoffTimestampMs: validTimestamp,
    status,
    isLive,
    score: raw.score ? raw.score.trim() : null,
    round: raw.round ? raw.round.trim() : null,
    venue: raw.venue ? raw.venue.trim() : null,
    homeTeamImage,
    awayTeamImage,
    thumbnail,
    playerUrl,
  }
}

/**
 * Health check for Cinevid API.
 * GET https://cinevid.st/api/public/events (limited check)
 */
export async function checkCinevidHealth(): Promise<{ status: string; ok: boolean; count?: number; latencyMs: number }> {
  const now = Date.now()
  if (healthCache && now - healthCache.timestamp < HEALTH_CACHE_TTL_MS) {
    return healthCache.data
  }

  if (inflightHealth) {
    return inflightHealth
  }

  inflightHealth = (async () => {
    const start = Date.now()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    try {
      const res = await fetch(`${CINEVID_BASE_URL}/api/public/events`, {
        signal: controller.signal,
        headers: DEFAULT_HEADERS,
      })
      const ok = res.ok
      let count = 0
      if (ok) {
        try {
          const json = await res.json()
          count = Array.isArray(json?.events) ? json.events.length : 0
        } catch { }
      }
      const data = {
        status: ok ? "healthy" : `status_${res.status}`,
        ok,
        count,
        latencyMs: Date.now() - start,
      }
      healthCache = { timestamp: Date.now(), data }
      return data
    } catch {
      return { status: "unreachable", ok: false, latencyMs: Date.now() - start }
    } finally {
      clearTimeout(timer)
      inflightHealth = null
    }
  })()

  return inflightHealth
}

/**
 * Fetches and returns all football events from Cinevid API.
 * Results are cached in-memory for 60 seconds with request deduplication.
 */
export async function fetchCinevidEvents(): Promise<CinevidParsedEvent[]> {
  const now = Date.now()
  if (eventsCache && now - eventsCache.timestamp < EVENTS_CACHE_TTL_MS) {
    return eventsCache.data
  }

  if (inflightEvents) {
    return inflightEvents
  }

  inflightEvents = (async () => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    try {
      const res = await fetch(`${CINEVID_BASE_URL}/api/public/events`, {
        signal: controller.signal,
        headers: DEFAULT_HEADERS,
      })

      if (!res.ok) {
        console.warn(`[cinevid] Events API returned status ${res.status}`)
        return eventsCache?.data ?? []
      }

      const json: CinevidApiResponse = await res.json()
      if (!json || !Array.isArray(json.events)) {
        return eventsCache?.data ?? []
      }

      // Filter and parse football events with deduplication by event id
      const seenIds = new Set<string>()
      const parsedList: CinevidParsedEvent[] = []

      for (const raw of json.events) {
        if (!raw || !raw.id) continue
        const idStr = String(raw.id).trim()
        if (seenIds.has(idStr)) continue

        const normalized = normalizeCinevidEvent(raw)
        if (normalized) {
          seenIds.add(idStr)
          parsedList.push(normalized)
        }
      }

      eventsCache = { timestamp: Date.now(), data: parsedList }
      return parsedList
    } catch (err) {
      console.error("[cinevid] Fetch events failed:", err)
      return eventsCache?.data ?? []
    } finally {
      clearTimeout(timer)
      inflightEvents = null
    }
  })()

  return inflightEvents
}

/**
 * Fetches a single Cinevid event by its event ID.
 */
export async function fetchCinevidEventById(id: string): Promise<CinevidParsedEvent | null> {
  const events = await fetchCinevidEvents()
  return events.find((e) => e.id === id) ?? null
}

/**
 * Clears in-memory caches (useful for testing or forced refresh).
 */
export function resetCinevidCache(): void {
  eventsCache = null
  inflightEvents = null
  healthCache = null
  inflightHealth = null
}

