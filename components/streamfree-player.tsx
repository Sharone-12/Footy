"use client"

import { UnifiedPlayer } from "./unified-player"
import type { MatchedStream, StreamFreeQuality } from "@/lib/streamfree/types"
import type { MatchedZLive, ZLiveChannel } from "@/lib/zlive/types"
import type { MatchedDaddyLive } from "@/lib/daddylive/types"
import type { StreamingProviderId } from "@/lib/streaming/types"

/**
 * StreamFreePlayer component.
 * Backwards-compatible wrapper around UnifiedPlayer.
 */
export function StreamFreePlayer({
  stream,
  zLive,
  daddyLive,
  genericChannel,
  initialProvider = "streamfree",
  onClose,
  initialQuality,
}: {
  stream: MatchedStream
  zLive?: MatchedZLive | null
  daddyLive?: MatchedDaddyLive | null
  genericChannel?: ZLiveChannel | null
  initialProvider?: StreamingProviderId
  onClose?: () => void
  initialQuality?: StreamFreeQuality
}) {
  return (
    <UnifiedPlayer
      fixtureTitle={stream.title}
      league={stream.league}
      streamFree={stream}
      zLive={zLive}
      daddyLive={daddyLive}
      genericChannel={genericChannel}
      initialProvider={initialProvider}
      onClose={onClose}
    />
  )
}

export { UnifiedPlayer }
