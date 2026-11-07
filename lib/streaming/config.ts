import type { StreamingProviderId } from "./types"

/**
 * MASTER SWITCH FOR ALL STREAMING PROVIDERS
 * Ranked by playback smoothness and buffer-free stability:
 * 1. DAMITV (Flawless, buffer-free, multiple audio feeds)
 * 2. Live24 (High-speed LiteSpeed Falcon CDN)
 * 3. Cinevid (Clean HD public event player)
 * 4. Matchora (Official broadcaster feeds: Sky/TNT/DAZN)
 * 5. DaddyLiveHD (Direct satellite sports channels)
 * 6. ZLive (Match streams + 24/7 channels)
 * 7. StreamFree (Alternative web streams)
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
  damitv: true, // 🟢 DAMITV (#1 Ranked - Flawless & Buffer-Free)
  live24: true, // 🟢 Live24 / StreamHive (Falcon HQ match streams)
  cinevid: true, // 🟢 Cinevid (HD Public Events API)
  matchora: true, // 🟢 Matchora (Fixtures + Broadcaster feeds)
  daddylive: true, // 🟢 DaddyLiveHD (Free public API)
  zlive: true, // 🟢 ZLive (Match streams + 24/7 channels)
  streamfree: true, // 🟢 StreamFree (Alternative web streams)
}

/** Fast helper to check if a provider is currently wired and enabled */
export function isProviderEnabled(provider: StreamingProviderId): boolean {
  return Boolean(STREAMING_PROVIDERS_CONFIG[provider])
}

