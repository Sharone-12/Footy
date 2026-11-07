import https from "node:https"
import type {
  DamiTvApiResponse,
  DamiTvParsedStream,
  DamiTvSource,
  DamiTvStreamItem,
} from "./types"

const API_BASE = "https://ondemand.st/papi/api"
const STREAMS_CACHE_TTL_MS = 60_000 // 60 seconds
const HEALTH_CACHE_TTL_MS = 30_000 // 30 seconds
const TIMEOUT_MS = 15_000

const API_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://damitv.st/",
  Origin: "https://damitv.st",
}

let streamsCache: { timestamp: number; data: DamiTvParsedStream[] } | null = null
let inflightStreams: Promise<DamiTvParsedStream[]> | null = null

let healthCache: { timestamp: number; data: { status: string; ok: boolean; streamCount?: number; latencyMs?: number } } | null = null
let inflightHealth: Promise<{ status: string; ok: boolean; streamCount?: number; latencyMs?: number }> | null = null

function httpsGetDamiTv<T>(path: string): Promise<T | null> {
  return new Promise((resolve) => {
    const req = https.get(
      {
        hostname: "ondemand.st",
        path: `/papi/api${path}`,
        headers: API_HEADERS,
        servername: "ondemand.st",
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
 * Health check endpoint for DAMITV API.
 */
export async function checkDamiTvHealth(): Promise<{ status: string; ok: boolean; streamCount?: number; latencyMs?: number }> {
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
      const streams = await fetchDamiTvStreams()
      const ok = streams.length > 0
      const data = {
        status: ok ? "healthy" : "no_streams",
        ok,
        streamCount: streams.length,
        latencyMs: Date.now() - start,
      }
      healthCache = { timestamp: Date.now(), data }
      return data
    } catch {
      return { status: "unreachable", ok: false, latencyMs: Date.now() - start }
    } finally {
      inflightHealth = null
    }
  })()

  return inflightHealth
}

/**
 * Parse home and away teams from DAMITV stream metadata.
 */
function parseTeams(stream: DamiTvStreamItem): { home: string; away: string } {
  if (stream.teams?.home?.name && stream.teams?.away?.name) {
    return {
      home: stream.teams.home.name.trim(),
      away: stream.teams.away.name.trim(),
    }
  }

  // Fallback to name format "Home vs Away" or "Home - Away" or "Home v Away"
  const m = (stream.name || "").match(/^(.+?)\s+(?:vs\.?|v|-)\s+(.+?)$/i)
  if (m) {
    return {
      home: m[1].trim(),
      away: m[2].trim(),
    }
  }

  return { home: (stream.name || "").trim(), away: "" }
}

/**
 * Normalize and deduplicate source objects for a stream.
 */
function normalizeSources(rawSources?: DamiTvSource[]): DamiTvSource[] {
  if (!Array.isArray(rawSources)) return []
  const map = new Map<string, DamiTvSource>()

  for (const src of rawSources) {
    if (!src.id || !src.embed) continue
    const srcId = String(src.id).trim()
    if (map.has(srcId)) continue

    map.set(srcId, {
      source: src.source || "manual",
      id: srcId,
      name: src.name || `Source ${srcId}`,
      sd: src.sd ? 1 : 0,
      hd: src.hd ? 1 : 0,
      embed: src.embed,
    })
  }

  return Array.from(map.values())
}

/**
 * Fetch all football streams from DAMITV.
 * Cached for ~60 seconds with in-flight deduplication and timeout protection.
 */
export async function fetchDamiTvStreams(forceRefresh = false): Promise<DamiTvParsedStream[]> {
  const now = Date.now()
  if (!forceRefresh && streamsCache && now - streamsCache.timestamp < STREAMS_CACHE_TTL_MS) {
    return streamsCache.data
  }

  if (inflightStreams) {
    return inflightStreams
  }

  inflightStreams = (async () => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    try {
      let json = await httpsGetDamiTv<DamiTvApiResponse>("/streams")
      if (!json) {
        const res = await fetch(`${API_BASE}/streams`, {
          signal: controller.signal,
          headers: API_HEADERS,
        })
        if (res.ok) {
          json = (await res.json()) as DamiTvApiResponse
        }
      }

      if (!json) {
        return streamsCache?.data ?? []
      }

      const categoryGroups = json?.streams || []

      if (!Array.isArray(categoryGroups)) {
        console.warn("[damitv] Invalid response format (expected streams category array)")
        return streamsCache?.data ?? []
      }

      const parsedList: DamiTvParsedStream[] = []
      const seenIds = new Set<string>()

      for (const group of categoryGroups) {
        const cat = (group.category || "").toLowerCase()
        // Extract football/soccer categories case-insensitively
        if (!/football|soccer/i.test(cat)) continue
        if (!Array.isArray(group.streams)) continue

        for (const item of group.streams) {
          if (!item.id || !item.name) continue
          const streamId = String(item.id).trim()
          if (seenIds.has(streamId)) continue
          seenIds.add(streamId)

          const { home, away } = parseTeams(item)
          const sources = normalizeSources(item.sources)

          const rawStatus = (item.status || "").toLowerCase()
          const isLive = rawStatus === "live"
          const status = isLive
            ? "LIVE"
            : rawStatus === "upcoming"
            ? "UPCOMING"
            : "OFFLINE"

          const startsAt = Number(item.starts_at) || 0
          const endsAt = Number(item.ends_at) || 0
          const kickoffIso = startsAt > 0 ? new Date(startsAt * 1000).toISOString() : null

          const defaultEmbed =
            item.embed ||
            sources[0]?.embed ||
            `https://damitv.st/embed/?id=${encodeURIComponent(streamId)}`

          parsedList.push({
            id: streamId,
            name: item.name.trim(),
            home,
            away,
            league: item.league || "Football",
            status,
            isLive,
            startsAt,
            endsAt,
            kickoffIso,
            poster: item.poster,
            viewers: item.viewers,
            embedUrl: defaultEmbed,
            sources,
          })
        }
      }

      streamsCache = { timestamp: Date.now(), data: parsedList }
      return parsedList
    } catch (err: unknown) {
      const isAbort = err instanceof Error && err.name === "AbortError"
      console.warn(`[damitv] Streams fetch error (${isAbort ? "timeout" : String(err)})`)
      return streamsCache?.data ?? []
    } finally {
      clearTimeout(timer)
      inflightStreams = null
    }
  })()

  return inflightStreams
}

/**
 * Fetch a single stream by ID.
 */
export async function fetchDamiTvStreamById(streamId: string): Promise<DamiTvParsedStream | null> {
  const streams = await fetchDamiTvStreams()
  return streams.find((s) => s.id === streamId) ?? null
}

/** Testing helper to clear the cache */
export function _clearDamiTvCache(): void {
  streamsCache = null
  inflightStreams = null
  healthCache = null
  inflightHealth = null
}
