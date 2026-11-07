import type { StreamFreeItem, StreamFreeResponse, StreamFreeSource } from "./types"

const BASE_URL = process.env.STREAMFREE_BASE_URL || "https://streamfree.top"
const DEFAULT_TIMEOUT_MS = 7_000
const CACHE_TTL_MS = 60_000

// In-memory cache store
let cachedStreams: StreamFreeItem[] | null = null
let cacheTimestamp = 0

// In-flight deduplication
let inflightDirectoryRequest: Promise<StreamFreeItem[]> | null = null
const inflightSingleRequests = new Map<string, Promise<StreamFreeItem | null>>()

/**
 * Reset cache for tests.
 */
export function clearStreamFreeCache(): void {
  cachedStreams = null
  cacheTimestamp = 0
  inflightDirectoryRequest = null
  inflightSingleRequests.clear()
}

/**
 * Fetch soccer streams from StreamFree directory with in-memory caching
 * and in-flight request deduplication.
 */
export async function fetchSoccerStreams(
  options: { forceRefresh?: boolean; timeoutMs?: number } = {},
): Promise<StreamFreeItem[]> {
  const { forceRefresh = false, timeoutMs = DEFAULT_TIMEOUT_MS } = options
  const now = Date.now()

  if (!forceRefresh && cachedStreams && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedStreams
  }

  if (inflightDirectoryRequest) {
    return inflightDirectoryRequest
  }

  const fetchPromise = (async () => {
    try {
      const signal = AbortSignal.timeout(timeoutMs)
      const res = await fetch(`${BASE_URL}/api/v1/streams?category=soccer`, {
        signal,
        headers: {
          Accept: "application/json",
          "User-Agent": "footyy-streamfree-agent/1.0",
        },
      })

      if (!res.ok) {
        console.warn(`[streamfree] Directory returned HTTP ${res.status}`)
        return cachedStreams ?? []
      }

      const json = (await res.json()) as StreamFreeResponse
      const streams = Array.isArray(json.streams) ? json.streams : []

      // Validate and clean each stream
      const validStreams = streams.filter((s): s is StreamFreeItem => {
        return (
          Boolean(s) &&
          typeof s.name === "string" &&
          typeof s.stream_key === "string" &&
          (s.category === "soccer" || !s.category) &&
          Array.isArray(s.sources)
        )
      })

      cachedStreams = validStreams
      cacheTimestamp = Date.now()
      return validStreams
    } catch (err) {
      const isAbort = err instanceof Error && err.name === "TimeoutError"
      console.error(
        `[streamfree] Directory fetch error (${isAbort ? "timed out" : err instanceof Error ? err.message : String(err)})`,
      )
      // Return stale cache if available, otherwise empty list
      return cachedStreams ?? []
    } finally {
      inflightDirectoryRequest = null
    }
  })()

  inflightDirectoryRequest = fetchPromise
  return fetchPromise
}

/**
 * Fetch a single stream by stream_key.
 */
export async function fetchSingleStream(
  streamKey: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<StreamFreeItem | null> {
  const key = streamKey.trim()
  if (!key) return null

  // Check in-flight
  const existing = inflightSingleRequests.get(key)
  if (existing) return existing

  const p = (async () => {
    try {
      const signal = AbortSignal.timeout(timeoutMs)
      const res = await fetch(`${BASE_URL}/api/v1/streams/${encodeURIComponent(key)}`, {
        signal,
        headers: {
          Accept: "application/json",
          "User-Agent": "footyy-streamfree-agent/1.0",
        },
      })

      if (!res.ok) {
        if (res.status === 404) return null
        console.warn(`[streamfree] Stream ${key} returned HTTP ${res.status}`)
        return null
      }

      const data = (await res.json()) as StreamFreeItem
      if (data && typeof data.name === "string" && Array.isArray(data.sources)) {
        return data
      }
      return null
    } catch (err) {
      console.error(`[streamfree] Failed fetching stream ${key}:`, err)
      return null
    } finally {
      inflightSingleRequests.delete(key)
    }
  })()

  inflightSingleRequests.set(key, p)
  return p
}

/**
 * Fetch updated streaming sources for a stream_key.
 * Falls back to fetchSingleStream if /sources endpoint is unavailable.
 */
export async function fetchStreamSources(
  streamKey: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<StreamFreeSource[]> {
  const key = streamKey.trim()
  if (!key) return []

  try {
    const signal = AbortSignal.timeout(timeoutMs)
    const res = await fetch(`${BASE_URL}/api/v1/sources/${encodeURIComponent(key)}`, {
      signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "footyy-streamfree-agent/1.0",
      },
    })

    if (res.ok) {
      const json = await res.json()
      if (Array.isArray(json)) return json
      if (Array.isArray(json.sources)) return json.sources
    }
  } catch {
    // /sources endpoint may be unavailable on some hosts, fall back to /streams/{key}
  }

  const stream = await fetchSingleStream(key, timeoutMs)
  return stream?.sources ?? []
}

export async function checkStreamFreeHealth(): Promise<{ ok: boolean; count?: number; latencyMs: number }> {
  const start = Date.now()
  try {
    const streams = await fetchSoccerStreams()
    return {
      ok: true,
      count: streams.length,
      latencyMs: Date.now() - start,
    }
  } catch {
    return {
      ok: false,
      latencyMs: Date.now() - start,
    }
  }
}

