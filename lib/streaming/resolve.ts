/**
 * One flat source list across every provider.
 *
 * The four integrations each hand back their own shape — StreamFree has
 * quality variants, DaddyLive has channels, DAMITV has named sources, ZLive
 * has a single channel. The player, the sidebar and the STREAMS tab all want
 * the same thing: "which sources exist, what are they called, what URL do I
 * frame". Normalising once here keeps that branching out of the UI, and the
 * provider clients and matchers stay untouched.
 */
import type { MatchedStream } from "@/lib/streamfree/types"
import type { MatchedZLive, ZLiveChannel } from "@/lib/zlive/types"
import type { MatchedDaddyLive } from "@/lib/daddylive/types"
import type { MatchedDamiTv } from "@/lib/damitv/types"
import type { StreamingProviderId } from "@/lib/streaming/types"

export type SourceStatus = "LIVE" | "UPCOMING" | "OFFLINE"

/** What everything downstream of a provider match actually needs. */
export type WatchSource = {
  provider: StreamingProviderId
  /** Stable across re-renders; also the iframe remount key. */
  key: string
  /** The source's own name — "HD", "Sky Sports Main Event", "Alpha". */
  label: string
  /** Normalised quality tag when the provider states one. */
  quality?: string
  url: string
  live: boolean
}

export type WatchProvider = {
  id: StreamingProviderId
  /** Kept for the sidebar's source-information area, never the page identity. */
  name: string
  status: SourceStatus
  sources: WatchSource[]
  /** Distinct quality tags, for the sidebar's "available quality" line. */
  qualities: string[]
  /** Set when the provider matched a broadcaster rather than this fixture. */
  caveat?: string
}

/** Everything the four `?fixture_id=` endpoints return for one fixture. */
export type StreamBundle = {
  streamFree?: MatchedStream | null
  zLive?: MatchedZLive | null
  daddyLive?: MatchedDaddyLive | null
  damiTv?: MatchedDamiTv | null
  /** A 24/7 broadcaster picked by hand, with no fixture behind it. */
  genericChannel?: ZLiveChannel | null
}

export const PROVIDER_NAME: Record<StreamingProviderId, string> = {
  streamfree: "StreamFree",
  damitv: "DAMITV",
  daddylive: "DaddyLive",
  zlive: "ZLive",
}

/** Display order: the providers that carry quality variants come first. */
const ORDER: StreamingProviderId[] = ["streamfree", "damitv", "daddylive", "zlive"]

const dedupe = (xs: (string | undefined)[]) =>
  Array.from(new Set(xs.filter((x): x is string => Boolean(x))))

function streamFreeProvider(m: MatchedStream): WatchProvider | null {
  const sources = (m.sources || []).filter((s) => s.url)
  if (!sources.length) return null
  return {
    id: "streamfree",
    name: PROVIDER_NAME.streamfree,
    status: m.status ?? (m.isLive ? "LIVE" : "OFFLINE"),
    sources: sources.map((s) => ({
      provider: "streamfree" as const,
      key: `streamfree:${s.quality}`,
      label: s.quality,
      quality: s.quality,
      url: s.url,
      live: Boolean(s.live ?? m.isLive),
    })),
    qualities: dedupe(sources.map((s) => s.quality)),
  }
}

function damiTvProvider(m: MatchedDamiTv): WatchProvider | null {
  const stream = m.stream
  if (!stream) return null
  const named = (stream.sources || []).filter((s) => s.embed)
  // `embedUrl` is the stream's default player; only fall back to it so a
  // single-source stream still plays when `sources` comes back empty.
  const sources: WatchSource[] = named.length
    ? named.map((s) => ({
        provider: "damitv" as const,
        key: `damitv:${s.id}`,
        label: s.name || "Source",
        quality: s.hd ? "HD" : s.sd ? "SD" : undefined,
        url: s.embed,
        live: stream.isLive,
      }))
    : stream.embedUrl
    ? [
        {
          provider: "damitv" as const,
          key: "damitv:default",
          label: "Default",
          url: stream.embedUrl,
          live: stream.isLive,
        },
      ]
    : []
  if (!sources.length) return null
  return {
    id: "damitv",
    name: PROVIDER_NAME.damitv,
    status: stream.status ?? (stream.isLive ? "LIVE" : "OFFLINE"),
    sources,
    qualities: dedupe(sources.map((s) => s.quality)),
  }
}

function daddyLiveProvider(m: MatchedDaddyLive): WatchProvider | null {
  const channels = (m.channels || []).filter((c) => c.player_url)
  if (!channels.length) return null
  return {
    id: "daddylive",
    name: PROVIDER_NAME.daddylive,
    // The schedule only lists events that are on, so a matched channel is on.
    status: "LIVE",
    sources: channels.map((c) => ({
      provider: "daddylive" as const,
      key: `daddylive:${c.channel_id}`,
      label: c.channel_name || `Channel ${c.channel_id}`,
      url: c.player_url,
      live: true,
    })),
    qualities: [],
    caveat: m.isConfirmedMatch ? undefined : "Matched by broadcast schedule",
  }
}

function zLiveProvider(
  m: MatchedZLive | null | undefined,
  generic: ZLiveChannel | null | undefined,
): WatchProvider | null {
  const channel = m?.channel || generic
  if (!channel) return null
  const url = channel.url || (channel.id ? `https://zlive.st/embed/${channel.id}` : "")
  if (!url) return null
  return {
    id: "zlive",
    name: PROVIDER_NAME.zlive,
    status: channel.live ? "LIVE" : "OFFLINE",
    sources: [
      {
        provider: "zlive",
        key: `zlive:${channel.id}`,
        label: channel.name || "Channel",
        quality: channel.quality,
        url,
        live: Boolean(channel.live),
      },
    ],
    qualities: dedupe([channel.quality]),
    caveat:
      m && !m.isConfirmedMatch
        ? "Broadcaster channel, not a confirmed fixture match"
        : undefined,
  }
}

/**
 * Providers that actually have something to play, in display order. A
 * provider with no usable source is dropped rather than shown as a dead
 * option — the sidebar is supposed to list what exists.
 */
export function buildProviders(bundle: StreamBundle): WatchProvider[] {
  const built: Partial<Record<StreamingProviderId, WatchProvider | null>> = {
    streamfree: bundle.streamFree ? streamFreeProvider(bundle.streamFree) : null,
    damitv: bundle.damiTv ? damiTvProvider(bundle.damiTv) : null,
    daddylive: bundle.daddyLive ? daddyLiveProvider(bundle.daddyLive) : null,
    zlive: zLiveProvider(bundle.zLive, bundle.genericChannel),
  }
  return ORDER.map((id) => built[id]).filter((p): p is WatchProvider => Boolean(p))
}

/** Flat list across providers, for the STREAMS tab. */
export const allSources = (providers: WatchProvider[]) =>
  providers.flatMap((p) => p.sources)

/**
 * The source a given selection resolves to. Falls back to the first source of
 * the selected provider, then to the first source anywhere, so a selection
 * that no longer exists after a refresh still plays something.
 */
export function resolveSource(
  providers: WatchProvider[],
  providerId: StreamingProviderId | null,
  sourceKey: string | null,
): { provider: WatchProvider; source: WatchSource } | null {
  if (!providers.length) return null
  const provider = providers.find((p) => p.id === providerId) ?? providers[0]
  const source =
    provider.sources.find((s) => s.key === sourceKey) ?? provider.sources[0]
  return source ? { provider, source } : null
}
