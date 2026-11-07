import type {
  MatchoraApiResponse,
  MatchoraParsedChannel,
  MatchoraParsedEvent,
  MatchoraRawChannel,
  MatchoraRawEvent,
} from "./types"

export const MATCHO_HOSTS = [
  "https://matchora.pro",
  "https://es.matchora.pro",
  "https://matchora.to",
] as const

const DEFAULT_TIMEOUT_MS = 6000
const CACHE_TTL_MS = 60_000 // 60s cache

interface CacheEntry {
  data: MatchoraParsedEvent[]
  timestamp: number
}

const scheduleCache = new Map<string, CacheEntry>()
const inflightSchedule = new Map<string, Promise<MatchoraParsedEvent[]>>()

let singleEventCache = new Map<string, { data: MatchoraParsedEvent; timestamp: number }>()

export function parseMatchoraChannel(ch: MatchoraRawChannel): MatchoraParsedChannel {
  return {
    id: String(ch.id),
    name: ch.name || "Broadcast Channel",
    country: ch.country,
    quality: ch.quality,
    lang: ch.lang,
    embedUrl: ch.embed_url,
  }
}

export function isFootballMatch(event: MatchoraRawEvent): boolean {
  if (!event) return false
  const sport = (event.sport || "").toLowerCase().trim()
  if (sport === "soccer" || sport === "football") return true
  // Some football matches might have null/empty sport or league indicator
  const league = (event.league || "").toLowerCase().trim()
  if (
    league.includes("la liga") ||
    league.includes("premier league") ||
    league.includes("serie a") ||
    league.includes("bundesliga") ||
    league.includes("ligue 1") ||
    league.includes("champions league") ||
    league.includes("europa league")
  ) {
    // Avoid American football
    if (sport.includes("american")) return false
    return true
  }
  return false
}

export function normalizeMatchoraEvent(raw: MatchoraRawEvent): MatchoraParsedEvent {
  const kickoffMs = (raw.kickoff || 0) * 1000
  const dateIso = new Date(kickoffMs).toISOString().split("T")[0]

  let status: MatchoraParsedEvent["status"] = "upcoming"
  if (raw.live || (raw.minute != null && raw.minute !== "")) {
    status = "live"
  } else if (raw.finished || raw.status === "FT") {
    status = "finished"
  }

  const channels: MatchoraParsedChannel[] = (raw.channels || []).map(parseMatchoraChannel)

  return {
    id: String(raw.id),
    home: (raw.home || "").trim(),
    away: (raw.away || "").trim(),
    league: (raw.league || "").trim(),
    sport: raw.sport || "Soccer",
    kickoff: kickoffMs,
    dateIso,
    status,
    minute: raw.minute != null ? String(raw.minute) : null,
    score: raw.score || null,
    channelCount: raw.channel_count ?? channels.length,
    channels,
    pageUrl: raw.page_url,
    embedUrl: raw.embed_url || `https://matchora.pro/embed/match/${raw.id}`,
  }
}

async function fetchFromHosts(path: string, signal?: AbortSignal): Promise<Response> {
  const userAgent =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

  let lastError: Error | null = null

  for (const host of MATCHO_HOSTS) {
    const url = `${host}${path}`
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          "User-Agent": userAgent,
          Accept: "application/json",
        },
        signal,
        cache: "no-store",
      })

      if (res.ok) {
        return res
      }
      lastError = new Error(`Matchora host ${host} returned status ${res.status}`)
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      // Continue to next host
    }
  }

  throw lastError ?? new Error("All Matchora hosts failed to respond")
}

export async function fetchMatchoraSchedule(options?: {
  date?: string
  liveOnly?: boolean
  watchable?: boolean
}): Promise<MatchoraParsedEvent[]> {
  const watchable = options?.watchable !== false ? 1 : 0
  const date = options?.date
  const live = options?.liveOnly ? 1 : 0

  const queryParams = new URLSearchParams()
  if (watchable) queryParams.set("watchable", "1")
  if (date) queryParams.set("date", date)
  if (live) queryParams.set("live", "1")

  const path = `/api/v1/schedule?${queryParams.toString()}`
  const cacheKey = path

  const cached = scheduleCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data
  }

  const existingInflight = inflightSchedule.get(cacheKey)
  if (existingInflight) {
    return existingInflight
  }

  const promise = (async () => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)

    try {
      const res = await fetchFromHosts(path, controller.signal)
      const data = (await res.json()) as MatchoraApiResponse

      const rawEvents = Array.isArray(data.events) ? data.events : []
      const footballEvents = rawEvents
        .filter(isFootballMatch)
        .map(normalizeMatchoraEvent)

      scheduleCache.set(cacheKey, {
        data: footballEvents,
        timestamp: Date.now(),
      })

      return footballEvents
    } finally {
      clearTimeout(timer)
      inflightSchedule.delete(cacheKey)
    }
  })()

  inflightSchedule.set(cacheKey, promise)
  return promise
}

export async function fetchMatchoraEventById(id: string): Promise<MatchoraParsedEvent | null> {
  const cached = singleEventCache.get(id)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)

  try {
    const res = await fetchFromHosts(`/api/v1/events/${encodeURIComponent(id)}`, controller.signal)
    const raw = (await res.json()) as MatchoraRawEvent
    if (!raw || !raw.id) return null

    const parsed = normalizeMatchoraEvent(raw)
    singleEventCache.set(id, { data: parsed, timestamp: Date.now() })
    return parsed
  } catch (err) {
    console.error(`[matchora] Failed to fetch event ${id}:`, err)
    return null
  } finally {
    clearTimeout(timer)
  }
}

export async function checkMatchoraHealth(): Promise<{ ok: boolean; count?: number; latencyMs: number }> {
  const start = Date.now()
  try {
    const events = await fetchMatchoraSchedule({ liveOnly: false })
    return {
      ok: true,
      count: events.length,
      latencyMs: Date.now() - start,
    }
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
    }
  }
}

export function resetMatchoraCache(): void {
  scheduleCache.clear()
  inflightSchedule.clear()
  singleEventCache.clear()
}

