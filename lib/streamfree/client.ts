import type { StreamFreeItem, StreamFreeResponse, StreamFreeSource } from "./types"

const DEFAULT_STREAMFREE_HOSTS = [
  "https://strmfree.pk",
  "https://strmfree.st",
  "https://streamfree.top",
]
const BASE_URL = process.env.STREAMFREE_BASE_URL || DEFAULT_STREAMFREE_HOSTS[0]
const STREAMFREE_MIRROR_INDEX = "https://strmfree.link/api/domains"
const DEFAULT_TIMEOUT_MS = 10_000
const CACHE_TTL_MS = 60_000

let activeBaseUrl = BASE_URL

function normalizeStreamFreeUrl(url: string, targetHost = activeBaseUrl): string {
  return url.replace(/https?:\/\/(?:strmfree\.(?:pk|st)|streamfree\.top)/gi, targetHost)
}

function inferQualityFromUrl(url: string): string {
  const lower = url.toLowerCase()
  if (lower.includes("4k") || lower.includes("2160")) return "4K"
  if (lower.includes("1080") || lower.includes("fhd")) return "FHD"
  if (lower.includes("480") || lower.includes("360") || lower.endsWith("sd")) return "SD"
  return "HD"
}

function normalizeStreamFreeItem(item: StreamFreeItem, targetHost = activeBaseUrl): StreamFreeItem {
  const isLive = item.match_timestamp
    ? Date.now() >= item.match_timestamp * 1000 - 15 * 60_000 && Date.now() <= item.match_timestamp * 1000 + 150 * 60_000
    : true

  let sources: StreamFreeSource[] = []
  if (Array.isArray(item.sources) && item.sources.length > 0) {
    sources = item.sources
      .filter((s) => Boolean(s?.url))
      .map((s) => ({
        ...s,
        url: normalizeStreamFreeUrl(s.url, targetHost),
      }))
  } else {
    if (item.iframe && typeof item.iframe === "string") {
      const url = normalizeStreamFreeUrl(item.iframe, targetHost)
      sources.push({
        quality: inferQualityFromUrl(url),
        url,
        live: isLive,
      })
    }
    if (Array.isArray(item.additional_sources)) {
      for (const extra of item.additional_sources) {
        if (typeof extra === "string" && extra.startsWith("http")) {
          const url = normalizeStreamFreeUrl(extra, targetHost)
          sources.push({ quality: inferQualityFromUrl(url), url, live: isLive })
        } else if (extra && typeof extra === "object") {
          const rawUrl = extra.url || extra.iframe
          if (rawUrl && typeof rawUrl === "string") {
            const url = normalizeStreamFreeUrl(rawUrl, targetHost)
            sources.push({
              quality: extra.quality || extra.label || extra.name || inferQualityFromUrl(url),
              url,
              live: extra.live ?? isLive,
            })
          }
        }
      }
    }
  }

  return {
    ...item,
    thumbnail_url: item.thumbnail_url ? normalizeStreamFreeUrl(item.thumbnail_url, targetHost) : undefined,
    iframe: item.iframe ? normalizeStreamFreeUrl(item.iframe, targetHost) : undefined,
    sources,
  }
}

async function fetchFromStreamFreeHosts(path: string, timeoutMs: number): Promise<{ res: Response; host: string }> {
  const candidates = Array.from(new Set([activeBaseUrl, ...DEFAULT_STREAMFREE_HOSTS]))
  let lastError: Error | null = null

  for (const host of candidates) {
    try {
      const res = await fetch(`${host}${path}`, {
        signal: AbortSignal.timeout(Math.min(timeoutMs, 6_000)),
        headers: {
          Accept: "application/json",
          "User-Agent": DEFAULT_BROWSER_UA,
        },
      })
      if (res.ok) {
        activeBaseUrl = host
        return { res, host }
      }
      lastError = new Error(`StreamFree host ${host} returned HTTP ${res.status}`)
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
    }
  }

  // Fallback: query official mirror directory at strmfree.link/api/domains
  try {
    const dirRes = await fetch(STREAMFREE_MIRROR_INDEX, {
      signal: AbortSignal.timeout(4_000),
      headers: { Accept: "application/json", "User-Agent": DEFAULT_BROWSER_UA },
    })
    if (dirRes.ok) {
      const domains = (await dirRes.json()) as string[]
      if (Array.isArray(domains)) {
        for (const domain of domains) {
          const host = domain.startsWith("http") ? domain : `https://${domain}`
          if (candidates.includes(host)) continue
          try {
            const res = await fetch(`${host}${path}`, {
              signal: AbortSignal.timeout(Math.min(timeoutMs, 6_000)),
              headers: { Accept: "application/json", "User-Agent": DEFAULT_BROWSER_UA },
            })
            if (res.ok) {
              activeBaseUrl = host
              return { res, host }
            }
          } catch {
            // Try next discovered mirror
          }
        }
      }
    }
  } catch {
    // Mirror directory unreachable
  }

  throw lastError ?? new Error("All StreamFree hosts failed")
}

const DEFAULT_BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

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
      const { res, host } = await fetchFromStreamFreeHosts("/api/v1/streams?category=soccer", timeoutMs)
      const json = (await res.json()) as StreamFreeResponse
      const streams = Array.isArray(json.streams) ? json.streams : []

      // Validate, clean, and rewrite dead mirror URLs to the active host
      const validStreams = streams
        .filter((s): s is StreamFreeItem => {
          return (
            Boolean(s) &&
            typeof s.name === "string" &&
            typeof s.stream_key === "string" &&
            (s.category === "soccer" || !s.category) &&
            (Array.isArray(s.sources) || typeof s.iframe === "string")
          )
        })
        .map((s) => normalizeStreamFreeItem(s, host))
        .filter((s) => s.sources.length > 0)

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
      const { res, host } = await fetchFromStreamFreeHosts(`/api/v1/streams/${encodeURIComponent(key)}`, timeoutMs)
      const data = (await res.json()) as StreamFreeItem
      if (data && typeof data.name === "string" && (Array.isArray(data.sources) || typeof data.iframe === "string")) {
        return normalizeStreamFreeItem(data, host)
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
    const { res, host } = await fetchFromStreamFreeHosts(`/api/v1/sources/${encodeURIComponent(key)}`, timeoutMs)
    const json = await res.json()
    const rawSources: StreamFreeSource[] = Array.isArray(json)
      ? json
      : Array.isArray(json.sources)
        ? json.sources
        : []
    if (rawSources.length > 0) {
      return rawSources.map((s) => ({
        ...s,
        url: s.url ? normalizeStreamFreeUrl(s.url, host) : s.url,
      }))
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
    const streams = await fetchSoccerStreams({ forceRefresh: true })
    return {
      ok: cachedStreams !== null,
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

