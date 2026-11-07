import type { ZLiveChannel, ZLiveManifest } from "./types"

const MANIFEST_URL = "https://zlive.st/embed/manifest.json"
const CACHE_TTL_MS = 60_000
const TIMEOUT_MS = 15_000

const DEFAULT_BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

// In-memory cache for the ZLive manifest
let manifestCache: { timestamp: number; data: ZLiveManifest } | null = null
let inflightManifest: Promise<ZLiveManifest | null> | null = null

/**
 * Fetch the complete ZLive embed manifest.
 * Cached for ~60 seconds with in-flight deduplication and timeout protection.
 */
export async function fetchZLiveManifest(forceRefresh = false): Promise<ZLiveManifest | null> {
  const now = Date.now()
  if (!forceRefresh && manifestCache && now - manifestCache.timestamp < CACHE_TTL_MS) {
    return manifestCache.data
  }

  if (inflightManifest) {
    return inflightManifest
  }

  inflightManifest = (async () => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    try {
      const res = await fetch(MANIFEST_URL, {
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "User-Agent": DEFAULT_BROWSER_UA,
        },
      })

      if (!res.ok) {
        console.warn(`[zlive] Manifest fetch failed with status ${res.status}`)
        return manifestCache?.data ?? null
      }

      const json = (await res.json()) as ZLiveManifest

      if (!json || !Array.isArray(json.channels)) {
        console.warn("[zlive] Invalid manifest payload structure")
        return manifestCache?.data ?? null
      }

      manifestCache = { timestamp: Date.now(), data: json }
      return json
    } catch (err: unknown) {
      const isAbort = err instanceof Error && err.name === "AbortError"
      console.warn(`[zlive] Manifest fetch error (${isAbort ? "timeout" : String(err)})`)
      return manifestCache?.data ?? null
    } finally {
      clearTimeout(timer)
      inflightManifest = null
    }
  })()

  return inflightManifest
}

/** Non-football keywords to filter out (e.g. motorsports, horse racing, kids, cricket) */
const EXCLUDE_REGEX =
  /\b(f1|formula\s*1|motogp|nascar|indycar|racing|horse|horses|equestrian|greyhound|kids|cartoon|anime|cricket|golf|rugby|tennis|snooker|darts|ufc|wwe|boxing|fight|nba|nhl|baseball|mlb|nfl)\b/i

/** Football broadcaster keywords and leagues */
const FOOTBALL_BROADCASTER_REGEX =
  /\b(football|soccer|premier|laliga|liga|serie\s*a|bundesliga|ligue\s*1|champions\s*league|uefa|fifa|afc|conmebol|bein|dazn|supersport|spersport|sky\s*sports|tnt\s*sport|match\s*tv|arena\s*sport|eleven|optus|tsn|setanta|polsat)\b/i

/**
 * Filter manifest channels down to football-related streams.
 * Removes known non-football sports and channels without valid embed URLs.
 */
export async function fetchFootballChannels(forceRefresh = false): Promise<ZLiveChannel[]> {
  const manifest = await fetchZLiveManifest(forceRefresh)
  if (!manifest?.channels) return []

  return manifest.channels.filter((c) => {
    if (!c.id || !c.url) return false

    const name = c.name || ""
    const sport = (c.sport || "").toLowerCase()
    const id = (c.id || "").toLowerCase()

    // 1. If explicit non-football sport or name contains excluded terms, drop
    if (sport && (sport === "kids" || sport === "f1" || sport === "other" || sport === "entertainment")) {
      return false
    }
    if (EXCLUDE_REGEX.test(name) || EXCLUDE_REGEX.test(id)) {
      return false
    }

    // 2. Accept if sport is football/soccer
    if (sport === "football" || sport === "soccer") {
      return true
    }

    // 3. Accept if name or id matches recognized football networks or fixture patterns
    if (FOOTBALL_BROADCASTER_REGEX.test(name) || FOOTBALL_BROADCASTER_REGEX.test(id)) {
      return true
    }

    // 4. Accept if match-like pairing (e.g. "team A vs team B")
    if (/\b(vs| v )\b/i.test(name)) {
      return true
    }

    return false
  })
}

/**
 * Get curated generic 24/7 football channels for manual selection on the Live page.
 */
export async function getGenericFootballChannels(): Promise<ZLiveChannel[]> {
  const channels = await fetchFootballChannels()
  // Keep live channels with clear football broadcast focus
  return channels.filter((c) => {
    const name = c.name || ""
    return (
      FOOTBALL_BROADCASTER_REGEX.test(name) &&
      !/\b(vs| v )\b/i.test(name) // Not a fixture-specific title
    )
  })
}

export async function checkZLiveHealth(): Promise<{ ok: boolean; count?: number; latencyMs: number }> {
  const start = Date.now()
  try {
    const channels = await fetchFootballChannels()
    return {
      ok: true,
      count: channels.length,
      latencyMs: Date.now() - start,
    }
  } catch {
    return {
      ok: false,
      latencyMs: Date.now() - start,
    }
  }
}

/** Testing helper to clear the cache */
export function _clearZLiveCache(): void {
  manifestCache = null
  inflightManifest = null
}

