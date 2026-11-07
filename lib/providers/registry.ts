/**
 * Configured providers.
 *
 * Base URLs and credentials live here and in the environment, once — nothing
 * downstream knows a hostname. Add a site by adding an entry.
 *
 * `supported: false` means the site publishes no documented listing API. It
 * is shown on the page as unsupported and never fetched: we do not parse
 * someone's HTML listings or work around anti-bot protection to find a
 * stream, so there is nothing to call.
 */
import { manualAdapter } from "./manual"
import { streamfreeAdapter } from "./streamfree"
import { youtubeAdapter } from "./youtube"
import { zliveAdapter } from "./zlive"
import { daddyliveAdapter } from "./daddylive"
import { damitvAdapter } from "./damitv"
import { cinevidAdapter } from "./cinevid"
import { matchoraAdapter } from "./matchora"
import type { ProviderEntry } from "./types"

/** Every provider, in display and preference order. */
export function registry(): ProviderEntry[] {
  return [
    { adapter: matchoraAdapter, supported: true, configured: true },
    { adapter: damitvAdapter, supported: true, configured: true },
    { adapter: cinevidAdapter, supported: true, configured: true },
    { adapter: streamfreeAdapter, supported: false, configured: false }, // Unwired for testing
    { adapter: daddyliveAdapter, supported: true, configured: true },
    { adapter: zliveAdapter, supported: true, configured: true },
    { adapter: manualAdapter, supported: true, configured: true },
    {
      adapter: youtubeAdapter,
      supported: true,
      configured: Boolean(process.env.YOUTUBE_API_KEY),
    },
  ]
}

/** The ones a discovery run will actually call. */
export const callable = (entries: ProviderEntry[]) =>
  entries.filter((e) => e.supported && e.configured)

// ── External site directory ──
//
// The link-only half of the registry: destinations the app points at rather
// than plays. Separate from the adapters above because these have no API and
// produce no player — a pill opens a tab and nothing more.

export type DirectoryCategory = "official" | "platform" | "gateway" | "unverified"

export const CATEGORY_LABEL: Record<DirectoryCategory, string> = {
  gateway: "External Gateways",
  official: "Official Broadcasters & Clubs",
  platform: "Video Platforms",
  unverified: "Other External Sites",
}

/** Shown under external gateways and unverified groups so directory presence
 *  is never read as a claim about what a site carries or official broadcasting rights. */
export const GATEWAY_NOTE =
  "External redirect links. Not official broadcasters and not hosted or verified by us. Links open in a new tab."

export const UNVERIFIED_NOTE =
  "Not broadcasters and not verified by us. We don't check what these sites carry."

export type DirectoryEntry = {
  name: string
  /** Rendered under the name, so the destination is never ambiguous. */
  domain: string
  url: string
  category: DirectoryCategory
  /** Enabled/disabled toggle so destinations can be turned on or off without removing configuration. */
  enabled: boolean
  /** Optional, and only for assets you hold a licence to use — nothing in
   *  this repo ships a third-party logo. */
  logo?: string
}

/**
 * Data-driven on purpose: a destination is a row here and needs no component
 * change. Gateways are kept visually and categorially separate from verified
 * official broadcasters.
 */
export const DIRECTORY: DirectoryEntry[] = [
  {
    name: "RoxieStreams",
    domain: "roxiestreams.su",
    url: "https://roxiestreams.su/soccer-streams-1",
    category: "gateway",
    enabled: true,
  },
  {
    name: "StreamCorner",
    domain: "streamcorner.st",
    url: "https://streamcorner.st/",
    category: "gateway",
    enabled: true,
  },
  {
    // Link-only on purpose. Cinevid publishes a documented events API, but no
    // terms, DMCA or legal page exists (all 404) and the catalogue spans every
    // major league plus films and TV, so redistribution rights could not be
    // verified. Until they are, this stays a link out under GATEWAY_NOTE and
    // gets no adapter and no embedded player.
    name: "Cinevid",
    domain: "cinevid.st",
    url: "https://cinevid.st",
    category: "gateway",
    enabled: true,
  },
  {
    name: "StreamFree",
    domain: "streamfree.top",
    url: "https://streamfree.top",
    category: "platform",
    enabled: true,
  },
  {
    name: "ZLive",
    domain: "zlive.st",
    url: "https://zlive.st",
    category: "platform",
    enabled: true,
  },
  {
    name: "DaddyLive",
    domain: "thedaddy.li",
    url: "https://thedaddy.li",
    category: "platform",
    enabled: true,
  },
  {
    name: "DAMITV",
    domain: "damitv.st",
    url: "https://damitv.st",
    category: "platform",
    enabled: true,
  },
  {
    name: "LaLiga",
    domain: "laliga.com",
    url: "https://www.laliga.com/",
    category: "official",
    enabled: true,
  },
  {
    name: "UEFA Champions League",
    domain: "uefa.com",
    url: "https://www.uefa.com/uefachampionsleague/",
    category: "official",
    enabled: true,
  },
  {
    name: "FC Barcelona",
    domain: "fcbarcelona.com",
    url: "https://www.fcbarcelona.com/",
    category: "official",
    enabled: true,
  },
  {
    name: "YouTube",
    domain: "youtube.com",
    url: "https://www.youtube.com/",
    category: "platform",
    enabled: true,
  },
]

/** Enabled entries of one category, in declaration order. */
export const directoryBy = (category: DirectoryCategory) =>
  DIRECTORY.filter((e) => e.enabled && e.category === category)

/** Prominent gateway sources for the live section. */
export const gatewaySources = () =>
  DIRECTORY.filter((e) => e.enabled && (e.category === "gateway" || e.category === "unverified"))
