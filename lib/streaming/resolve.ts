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
import type { MatchedCinevid } from "@/lib/cinevid/types"
import type { MatchedLive24 } from "@/lib/live24/types"
import type { MatchedMatchora } from "@/lib/matchora/types"
import type { StreamingProviderId } from "@/lib/streaming/types"
import { isProviderEnabled } from "./config"

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

/** Everything the five `?fixture_id=` endpoints return for one fixture. */
export type StreamBundle = {
  matchora?: MatchedMatchora | null
  streamFree?: MatchedStream | null
  zLive?: MatchedZLive | null
  daddyLive?: MatchedDaddyLive | null
  damiTv?: MatchedDamiTv | null
  cinevid?: MatchedCinevid | null
  live24?: MatchedLive24 | null
  /** A 24/7 broadcaster picked by hand, with no fixture behind it. */
  genericChannel?: ZLiveChannel | null
  /** All available 24/7 football channels from the manifest. */
  genericChannels?: ZLiveChannel[] | null
}

export const PROVIDER_NAME: Record<StreamingProviderId, string> = {
  matchora: "Matchora",
  damitv: "DAMITV",
  cinevid: "Cinevid",
  live24: "Live24",
  streamfree: "StreamFree",
  daddylive: "DaddyLive",
  zlive: "ZLive",
}

/** Display order: Ranked hierarchy:
 * 1. Cinevid (Clean HD public event player)
 * 2. DAMITV (Flawless, 0 buffer)
 * 3. Matchora (Official broadcaster feeds)
 * 4. DaddyLive (Live sports channels)
 * 5. Live24 (High-speed LiteSpeed Falcon CDN)
 * 6. ZLive (24/7 channels & fallback)
 * 7. StreamFree (Alternative web streams)
 */
const ORDER: StreamingProviderId[] = ["cinevid", "damitv", "matchora", "daddylive", "live24", "zlive", "streamfree"]

const dedupe = (xs: (string | undefined)[]) =>
  Array.from(new Set(xs.filter((x): x is string => Boolean(x))))

function matchoraProvider(m: MatchedMatchora | any): WatchProvider | null {
  if (!m) return null
  const event = m.event || (m.embedUrl ? m : null)
  if (!event || !event.embedUrl) return null

  const sources: WatchSource[] = []

  // 1. Primary match embed
  sources.push({
    provider: "matchora" as const,
    key: `matchora:${event.id}`,
    label: "Main Player",
    quality: "HD",
    url: event.embedUrl,
    live: Boolean(event.status === "live"),
  })

  // 2. Specific broadcast channels if available
  if (Array.isArray(event.channels)) {
    for (const ch of event.channels) {
      if (ch.embedUrl) {
        sources.push({
          provider: "matchora" as const,
          key: `matchora:ch:${ch.id}`,
          label: `${ch.name}${ch.lang ? ` (${ch.lang})` : ""}`,
          quality: ch.quality || "HD",
          url: ch.embedUrl,
          live: Boolean(event.status === "live"),
        })
      }
    }
  }

  return {
    id: "matchora",
    name: PROVIDER_NAME.matchora,
    status: event.status === "live" ? "LIVE" : event.status === "finished" ? "OFFLINE" : "UPCOMING",
    sources,
    qualities: dedupe(sources.map((s) => s.quality)),
  }
}

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

function damiTvProvider(m: MatchedDamiTv | any): WatchProvider | null {
  if (!m) return null
  const stream = m.stream || (m.embedUrl || m.sources ? m : null)
  if (!stream) return null
  const named = (stream.sources || []).filter((s: any) => s.embed)
  // `embedUrl` is the stream's default player; only fall back to it so a
  // single-source stream still plays when `sources` comes back empty.
  const sources: WatchSource[] = named.length
    ? named.map((s: any) => ({
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

function live24Provider(m: MatchedLive24 | any): WatchProvider | null {
  if (!m) return null
  const event = m.event || (m.streams ? m : null)
  if (!event || !Array.isArray(event.streams) || event.streams.length === 0) return null

  const sources: WatchSource[] = event.streams.map((s: any, idx: number) => ({
    provider: "live24" as const,
    key: `live24:${event.id || "match"}:${idx}`,
    label: s.name || (s.language ? `Stream ${idx + 1} [${s.language}]` : `Stream ${idx + 1}`),
    quality: "HD",
    url: s.url,
    live: Boolean(event.isLive ?? true),
  }))

  if (!sources.length) return null

  return {
    id: "live24",
    name: PROVIDER_NAME.live24,
    status: event.isLive ? "LIVE" : "UPCOMING",
    sources,
    qualities: ["HD"],
    caveat: m.isConfirmedMatch ? undefined : "Candidate match, verify fixture",
  }
}

function cinevidProvider(m: MatchedCinevid | any): WatchProvider | null {
  if (!m) return null
  const event = m.event || (m.playerUrl ? m : null)
  if (!event || !event.playerUrl) return null

  const sources: WatchSource[] = [
    {
      provider: "cinevid" as const,
      key: `cinevid:${event.id}`,
      label: event.league || "HD Live Player",
      quality: "HD",
      url: event.playerUrl,
      live: Boolean(event.isLive || event.status === "LIVE"),
    },
  ]

  return {
    id: "cinevid",
    name: PROVIDER_NAME.cinevid,
    status: event.status === "LIVE" ? "LIVE" : event.status === "FINISHED" ? "OFFLINE" : "UPCOMING",
    sources,
    qualities: ["HD"],
    caveat: m.isConfirmedMatch ? undefined : "Unconfirmed match, verify fixture",
  }
}

function daddyLiveProvider(m: MatchedDaddyLive | any): WatchProvider | null {
  if (!m) return null
  const rawChannels = m.channels || (Array.isArray(m) ? m : [])
  const channels = rawChannels.filter((c: any) => c.player_url)
  if (!channels.length) return null
  return {
    id: "daddylive",
    name: PROVIDER_NAME.daddylive,
    // The schedule only lists events that are on, so a matched channel is on.
    status: "LIVE",
    sources: channels.map((c: any) => ({
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
  m: MatchedZLive | any | null | undefined,
  generic: ZLiveChannel | null | undefined,
  allGenerics?: ZLiveChannel[] | null,
): WatchProvider | null {
  // If no match for this fixture and no explicit generic channel requested, ZLive has no stream for this match
  if (!m && !generic) {
    return null
  }

  const sources: WatchSource[] = []

  // 1. Primary fixture-matched channel or specific generic channel
  const primary = m?.channel || (m?.id && m?.url ? m : null) || generic
  if (primary && primary.id) {
    sources.push({
      provider: "zlive",
      key: `zlive:${primary.id}`,
      label: primary.name || "Channel",
      quality: primary.quality,
      url: primary.url || `https://zlive.st/embed/${primary.id}`,
      live: Boolean(primary.live ?? true),
    })
  }

  // 2. Also register all available generic 24/7 channels as selectable sources
  if (allGenerics && allGenerics.length > 0) {
    for (const ch of allGenerics) {
      if (ch.id && !sources.some((s) => s.key === `zlive:${ch.id}`)) {
        sources.push({
          provider: "zlive",
          key: `zlive:${ch.id}`,
          label: ch.name || "Channel",
          quality: ch.quality,
          url: ch.url || `https://zlive.st/embed/${ch.id}`,
          live: Boolean(ch.live ?? true),
        })
      }
    }
  }

  if (!sources.length) return null

  return {
    id: "zlive",
    name: PROVIDER_NAME.zlive,
    status: "LIVE",
    sources,
    qualities: dedupe(sources.map((s) => s.quality)),
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
    matchora: isProviderEnabled("matchora") && bundle.matchora ? matchoraProvider(bundle.matchora) : null,
    damitv: isProviderEnabled("damitv") && bundle.damiTv ? damiTvProvider(bundle.damiTv) : null,
    cinevid: isProviderEnabled("cinevid") && bundle.cinevid ? cinevidProvider(bundle.cinevid) : null,
    live24: isProviderEnabled("live24") && bundle.live24 ? live24Provider(bundle.live24) : null,
    streamfree: isProviderEnabled("streamfree") && bundle.streamFree ? streamFreeProvider(bundle.streamFree) : null,
    daddylive: isProviderEnabled("daddylive") && bundle.daddyLive ? daddyLiveProvider(bundle.daddyLive) : null,
    zlive: isProviderEnabled("zlive") ? zLiveProvider(bundle.zLive, bundle.genericChannel, bundle.genericChannels) : null,
  }
  return ORDER.filter(isProviderEnabled).map((id) => built[id]).filter((p): p is WatchProvider => Boolean(p))
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
