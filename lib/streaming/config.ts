import type { StreamingProviderId } from "./types"

/**
 * MASTER SWITCH FOR ALL STREAMING PROVIDERS
 * Ranked hierarchy:
 * 1. Cinevid (Clean HD public event player)
 * 2. DAMITV (Flawless, buffer-free, multiple audio feeds)
 * 3. Matchora (Official broadcaster feeds: Sky/TNT/DAZN)
 * 4. DaddyLiveHD (Direct satellite sports channels)
 * 5. Live24 (High-speed LiteSpeed Falcon CDN)
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
  cinevid: true, // 🟢 Cinevid (#1 Ranked - Clean HD Public Event Player)
  damitv: true, // 🟢 DAMITV (#2 Ranked - Flawless & Buffer-Free)
  matchora: true, // 🟢 Matchora (#3 Ranked - Fixtures + Broadcaster feeds)
  daddylive: true, // 🟢 DaddyLiveHD (#4 Ranked - Live sports channels)
  live24: true, // 🟢 Live24 / StreamHive (#5 Ranked - Falcon HQ match streams)
  zlive: true, // 🟢 ZLive (Match streams + 24/7 channels)
  streamfree: true, // 🟢 StreamFree (Alternative web streams)
}

/** Fast helper to check if a provider is currently wired and enabled */
export function isProviderEnabled(provider: StreamingProviderId): boolean {
  return Boolean(STREAMING_PROVIDERS_CONFIG[provider])
}

