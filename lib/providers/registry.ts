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
import { youtubeAdapter } from "./youtube"
import type { ProviderEntry } from "./types"

/** Every provider, in display and preference order. */
export function registry(): ProviderEntry[] {
  return [
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

export type DirectoryCategory = "official" | "platform" | "unverified"

export const CATEGORY_LABEL: Record<DirectoryCategory, string> = {
  official: "Official competition & club sites",
  platform: "Video platforms",
  unverified: "Other external sites",
}

/** Shown under the unverified group so directory presence is never read as
 *  a claim about what a site carries. */
export const UNVERIFIED_NOTE =
  "Not broadcasters and not verified by us. We don't check what these sites carry."

export type DirectoryEntry = {
  name: string
  /** Rendered under the name, so the destination is never ambiguous. */
  domain: string
  url: string
  category: DirectoryCategory
  /** Optional, and only for assets you hold a licence to use — nothing in
   *  this repo ships a third-party logo. */
  logo?: string
}

/**
 * Data-driven on purpose: a destination is a row here and needs no component
 * change. Anything added under `unverified` renders in its own group with
 * UNVERIFIED_NOTE attached.
 */
export const DIRECTORY: DirectoryEntry[] = [
  {
    name: "LaLiga",
    domain: "laliga.com",
    url: "https://www.laliga.com/",
    category: "official",
  },
  {
    name: "UEFA Champions League",
    domain: "uefa.com",
    url: "https://www.uefa.com/uefachampionsleague/",
    category: "official",
  },
  {
    name: "FC Barcelona",
    domain: "fcbarcelona.com",
    url: "https://www.fcbarcelona.com/",
    category: "official",
  },
  {
    name: "YouTube",
    domain: "youtube.com",
    url: "https://www.youtube.com/",
    category: "platform",
  },
]

/** Entries of one category, in declaration order. */
export const directoryBy = (category: DirectoryCategory) =>
  DIRECTORY.filter((e) => e.category === category)
