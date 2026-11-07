/** Self-check for provider normalisation: `node lib/streaming/resolve.test.ts` */
import assert from "node:assert/strict"
import { buildProviders, resolveSource, allSources } from "./resolve.ts"
import type { MatchedStream } from "../streamfree/types.ts"
import type { MatchedDamiTv } from "../damitv/types.ts"
import type { MatchedDaddyLive } from "../daddylive/types.ts"
import type { MatchedZLive } from "../zlive/types.ts"
import type { MatchedCinevid } from "../cinevid/types.ts"
import type { MatchedMatchora } from "../matchora/types.ts"
import type { MatchedLive24 } from "../live24/types.ts"

const matchora = {
  confidence: 95,
  event: {
    id: "m1",
    home: "A",
    away: "B",
    league: "La Liga",
    sport: "Soccer",
    kickoff: 1794100000000,
    dateIso: "2026-11-07",
    status: "live",
    channelCount: 2,
    channels: [
      { id: "c1", name: "DAZN", country: "ES", embedUrl: "https://matchora.pro/embed/channel/c1" },
    ],
    embedUrl: "https://matchora.pro/embed/match/m1",
  },
} as MatchedMatchora

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

const cinevid = {
  event_id: 1,
  fixtureId: 1,
  isConfirmedMatch: true,
  confidence: 95,
  event: {
    id: "cv1",
    slug: "a-vs-b",
    title: "A vs B",
    sport: "Football",
    home: "A",
    away: "B",
    league: "La Liga",
    utcDate: "2026-11-07",
    utcTime: "20:00",
    kickoffIso: "2026-11-07T20:00:00.000Z",
    kickoffTimestampMs: 1794100000000,
    status: "LIVE",
    isLive: true,
    score: null,
    round: null,
    venue: null,
    homeTeamImage: null,
    awayTeamImage: null,
    thumbnail: null,
    playerUrl: "https://cinevid.st/embed/live/cv1",
  },
} as MatchedCinevid

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

const live24 = {
  event: {
    id: "l1",
    home: "A",
    away: "B",
    sport: "football",
    date: "2026-11-07",
    time: "20:00",
    streams: [{ name: "Stream 1", url: "https://live24/1" }],
    isLive: true,
  },
  confidence: 1,
  isConfirmedMatch: true,
} as MatchedLive24

// ── Display order and per-provider source counts (damitv ranked #1 buffer-free) ──
const all = buildProviders({ matchora, damiTv, cinevid, streamFree, daddyLive, zLive, live24 })
assert.deepEqual(
  all.map((p) => p.id),
  ["damitv", "cinevid", "matchora", "daddylive", "live24", "zlive", "streamfree"],
)
assert.equal(all[0].sources.length, 1) // damiTv
assert.deepEqual(all[0].sources.map((s) => s.url), ["https://dami/a"])
assert.deepEqual(all[1].sources.map((s) => s.url), ["https://cinevid.st/embed/live/cv1"]) // cinevid
assert.equal(all[2].sources.length, 2) // matchora (main + c1)
assert.deepEqual(all[2].sources.map((s) => s.url), ["https://matchora.pro/embed/match/m1", "https://matchora.pro/embed/channel/c1"])
assert.deepEqual(all[3].sources.map((s) => s.label), ["Sky Main"]) // daddyLive
assert.deepEqual(all[4].sources.map((s) => s.url), ["https://live24/1"]) // live24
assert.equal(all[5].sources[0].url, "https://zlive.st/embed/z1") // zLive
assert.equal(allSources(all).length, 9)

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

// ── A stale selection resolves to something playable rather than nothing (falls back to default #1 damitv) ──
const gone = resolveSource(all, "streamfree", "streamfree:4K")
assert.equal(gone?.source.url, "https://sf/fhd")
const unknownProvider = resolveSource(all, "unknown" as any, "unknown:key")
assert.equal(unknownProvider?.source.url, "https://dami/a")
const missingProvider = resolveSource(all, "daddylive", "daddylive:999")
assert.equal(missingProvider?.source.url, "https://dl/1")
assert.equal(resolveSource(all, null, null)?.provider.id, "damitv")

// ── A hand-picked 24/7 channel is a provider with one source ──
const generic = buildProviders({
  genericChannel: { id: "g", name: "LaLiga TV", live: true, url: "https://z/g" },
})
assert.deepEqual(generic.map((p) => p.id), ["zlive"])
assert.equal(generic[0].caveat, undefined)

console.log("resolve.test.ts ok")
