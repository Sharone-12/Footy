/** Self-check for provider normalisation: `node lib/streaming/resolve.test.ts` */
import assert from "node:assert/strict"
import { buildProviders, resolveSource, allSources } from "./resolve.ts"
import type { MatchedStream } from "../streamfree/types.ts"
import type { MatchedDamiTv } from "../damitv/types.ts"
import type { MatchedDaddyLive } from "../daddylive/types.ts"
import type { MatchedZLive } from "../zlive/types.ts"

const streamFree = {
  streamKey: "k",
  title: "A vs B",
  league: "La Liga",
  matchTimestamp: 0,
  status: "LIVE",
  isLive: true,
  availableQualities: ["FHD", "HD"],
  sources: [
    { quality: "FHD", url: "https://sf/fhd", live: true },
    { quality: "HD", url: "https://sf/hd", live: true },
  ],
  bestSource: { quality: "FHD", url: "https://sf/fhd", live: true },
  confidence: 1,
  matchedTeams: { home: "A", away: "B" },
} as MatchedStream

const damiTv = {
  stream: {
    id: "d1",
    name: "A vs B",
    home: "A",
    away: "B",
    league: "La Liga",
    status: "LIVE",
    isLive: true,
    startsAt: 0,
    endsAt: 0,
    kickoffIso: null,
    embedUrl: "https://dami/default",
    sources: [{ id: "s1", name: "Alpha", hd: 1, embed: "https://dami/a" }],
  },
  confidence: 1,
  isConfirmedMatch: true,
} as MatchedDamiTv

const daddyLive = {
  event: {
    id: "e",
    rawTitle: "A vs B",
    home: "A",
    away: "B",
    timeStr: "20:00",
    kickoffIso: null,
    channels: [],
  },
  confidence: 1,
  isConfirmedMatch: false,
  channels: [
    { channel_id: "1", channel_name: "Sky Main", player_url: "https://dl/1" },
    // No player_url: unplayable, so it must not reach the UI as an option.
    { channel_id: "2", channel_name: "Dead", player_url: "" },
  ],
} as MatchedDaddyLive

const zLive = {
  channel: { id: "z1", name: "ESPN", quality: "HD", live: true, url: "" },
  confidence: 0.5,
  isConfirmedMatch: false,
  isGenericBroadcaster: true,
} as MatchedZLive

// ── Display order and per-provider source counts ──
const all = buildProviders({ streamFree, damiTv, daddyLive, zLive })
assert.deepEqual(
  all.map((p) => p.id),
  ["streamfree", "damitv", "daddylive", "zlive"],
)
assert.equal(all[0].sources.length, 2)
assert.deepEqual(all[0].qualities, ["FHD", "HD"])
// Named sources win over the stream's default embed.
assert.deepEqual(all[1].sources.map((s) => s.url), ["https://dami/a"])
assert.deepEqual(all[1].qualities, ["HD"])
// The channel without a player URL is dropped.
assert.deepEqual(all[2].sources.map((s) => s.label), ["Sky Main"])
assert.match(all[2].caveat ?? "", /schedule/)
// A ZLive channel with no url falls back to the embed path built from its id.
assert.equal(all[3].sources[0].url, "https://zlive.st/embed/z1")
assert.equal(allSources(all).length, 5)

// ── A provider with nothing playable is omitted, not shown dead ──
const empty = buildProviders({
  streamFree: { ...streamFree, sources: [] } as MatchedStream,
  daddyLive: {
    ...daddyLive,
    channels: [{ channel_id: "2", channel_name: "Dead", player_url: "" }],
  } as MatchedDaddyLive,
})
assert.deepEqual(empty, [])
assert.equal(resolveSource(empty, "streamfree", null), null)

// ── DAMITV with no named sources still plays via the default embed ──
const fallback = buildProviders({
  damiTv: { ...damiTv, stream: { ...damiTv.stream, sources: [] } } as MatchedDamiTv,
})
assert.deepEqual(fallback[0].sources.map((s) => s.url), ["https://dami/default"])

// ── A stale selection resolves to something playable rather than nothing ──
const gone = resolveSource(all, "streamfree", "streamfree:4K")
assert.equal(gone?.source.url, "https://sf/fhd")
const missingProvider = resolveSource(all, "daddylive", "daddylive:999")
assert.equal(missingProvider?.source.url, "https://dl/1")
assert.equal(resolveSource(all, null, null)?.provider.id, "streamfree")

// ── A hand-picked 24/7 channel is a provider with one source ──
const generic = buildProviders({
  genericChannel: { id: "g", name: "LaLiga TV", live: true, url: "https://z/g" },
})
assert.deepEqual(generic.map((p) => p.id), ["zlive"])
assert.equal(generic[0].caveat, undefined)

console.log("resolve.test.ts ok")
