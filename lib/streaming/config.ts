import type { StreamingProviderId } from "./types"

/**
 * MASTER SWITCH FOR ALL STREAMING PROVIDERS
 *
 * Set any provider to `false` to immediately unwire/disable it across:
 * - Match discovery (/squad/stream, fixture pages)
 * - Watch studio & player tabs (/live/watch)
 * - Live match badges & tickers (/live)
 * - Network health monitoring (/api/streams/health)
 *
 * Set back to `true` to re-enable.
 */
export const STREAMING_PROVIDERS_CONFIG: Record<StreamingProviderId, boolean> = {
  matchora: true, // 🟢 Matchora (Fixtures + Broadcaster feeds)
  damitv: true, // 🟢 DAMITV (Multi-language streams)
  cinevid: true, // ⚪ Cinevid (HD Public Events API - set to false to test unwiring)
  streamfree: true, // ⚪ StreamFree (Unwired for testing - change to true to re-enable)
  daddylive: true, // 🟢 DaddyLiveHD (Free public API)
  zlive: true, // 🟢 ZLive (Match streams + 24/7 channels)
  live24: true, // 🟢 Live24 / StreamHive (Falcon HQ match streams)
}

/** Fast helper to check if a provider is currently wired and enabled */
export function isProviderEnabled(provider: StreamingProviderId): boolean {
  return Boolean(STREAMING_PROVIDERS_CONFIG[provider])
}

