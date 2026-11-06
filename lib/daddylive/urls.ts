/**
 * DaddyLiveHD Player URL Generator.
 *
 * Supported paths:
 *   - /stream/stream-{channel_id}.php (Default)
 *   - /cast/stream-{channel_id}.php
 *   - /watch/stream-{channel_id}.php
 *   - /plus/stream-{channel_id}.php
 *   - /casting/stream-{channel_id}.php
 *   - /player/stream-{channel_id}.php
 */

export type DaddyLivePlayerFolder = "stream" | "cast" | "watch" | "plus" | "casting" | "player"

const DADDYLIVE_BASE = "https://thedaddy.li"

/**
 * Generate documented DaddyLive iframe player URL.
 */
export function getDaddyLivePlayerUrl(
  channelId: string | number,
  folder: DaddyLivePlayerFolder = "stream",
): string {
  const cleanId = String(channelId).trim().replace(/^stream-|\.php$/g, "")
  return `${DADDYLIVE_BASE}/${folder}/stream-${cleanId}.php`
}

/**
 * Normalise logo URL from DaddyLive API response.
 * - If relative (e.g., "logos/channel.png"), prefixes with "https://thedaddy.li/logos/..."
 * - If absolute URL, preserves as-is.
 * - If absent, returns undefined.
 */
export function normalizeDaddyLiveLogo(rawLogo?: string | null): string | undefined {
  if (!rawLogo || typeof rawLogo !== "string") return undefined
  const trimmed = rawLogo.trim()
  if (!trimmed) return undefined

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed
  }

  const cleanPath = trimmed.replace(/^\/?(logos\/)?/, "")
  return `${DADDYLIVE_BASE}/logos/${cleanPath}`
}
