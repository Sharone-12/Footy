import type { Fixture } from "@/lib/providers/types"
import { INTERNATIONAL_ALIASES, INTERNATIONAL_COMPETITIONS } from "../streaming/aliases.ts"
import type {
  MatchedStream,
  StreamFreeItem,
  StreamFreeQuality,
  StreamFreeSource,
  StreamStatus,
} from "./types"

export const CONFIDENCE_THRESHOLD = 0.75

/** Club suffixes and filler that appear in some renderings of a name. */
const FILLER = new Set([
  "fc",
  "cf",
  "afc",
  "sc",
  "ac",
  "as",
  "ss",
  "cd",
  "rc",
  "rcd",
  "ud",
  "sd",
  "bsc",
  "vfb",
  "vfl",
  "tsg",
  "fsv",
  "sv",
  "club",
  "de",
  "futbol",
  "football",
  "calcio",
  "balompie",
  "the",
])

/** Canonical aliases for clubs. */
const ALIASES: Record<string, string[]> = {
  barcelona: ["barca", "fc barcelona", "barcelona fc", "fcb"],
  "real madrid": ["madrid", "real madrid cf"],
  "atletico madrid": ["atleti", "atletico de madrid", "atlético madrid", "club atletico de madrid"],
  "deportivo alaves": ["alaves", "deportivo alavés", "d alaves"],
  sevilla: ["sevilla fc", "seville"],
  "athletic club": ["athletic bilbao", "athletic"],
  "real sociedad": ["sociedad", "la real"],
  "real betis": ["betis", "real betis balompie"],
  "celta vigo": ["celta", "rc celta", "rc celta de vigo"],
  "rayo vallecano": ["rayo"],
  valencia: ["valencia cf"],
  villarreal: ["villarreal cf"],
  girona: ["girona fc"],
  espanyol: ["rcd espanyol"],
  getafe: ["getafe cf"],
  osasuna: ["ca osasuna"],
  mallorca: ["rcd mallorca"],
  "las palmas": ["ud las palmas"],
  leganes: ["cd leganes"],
  valladolid: ["real valladolid"],
  malaga: ["malaga cf", "málaga", "málaga cf"],
  "racing santander": ["real racing club", "racing de santander", "racing club", "real racing club de santander", "racing club de santander", "racing"],
  "real racing club": ["racing santander", "racing de santander", "racing club", "real racing club de santander", "racing club de santander", "racing"],
  "sporting gijon": ["sporting de gijon", "sporting gijón", "real sporting", "real sporting de gijon"],
  "real oviedo": ["oviedo"],
  "real zaragoza": ["zaragoza"],
  "deportivo la coruna": ["deportivo de la coruna", "deportivo de a coruna", "deportivo a coruna", "deportivo", "depor", "rc deportivo"],
  albacete: ["albacete bp", "albacete balompie"],
  burgos: ["burgos cf"],
  castellon: ["cd castellon", "castellón"],
  cadiz: ["cádiz", "cadiz cf"],
  granada: ["granada cf"],
  almeria: ["almería", "ud almeria"],
  levante: ["levante ud"],
  elche: ["elche cf"],
  cordoba: ["córdoba", "cordoba cf"],
  eibar: ["sd eibar"],
  huesca: ["sd huesca"],
  mirandes: ["cd mirandes", "mirandés"],
  ferrol: ["racing ferrol", "racing de ferrol"],
  tenerife: ["cd tenerife"],
  cartagena: ["fc cartagena"],
  eldense: ["cd eldense"],
  // Premier League & England
  "manchester united": ["man united", "man utd", "manutd", "mufc"],
  "manchester city": ["man city", "mancity", "mcfc"],
  arsenal: ["arsenal fc", "the gunners"],
  chelsea: ["chelsea fc", "the blues"],
  liverpool: ["liverpool fc"],
  tottenham: ["tottenham hotspur", "spurs"],
  "aston villa": ["villa"],
  "newcastle united": ["newcastle"],
  "west ham united": ["west ham"],
  "brighton hove albion": ["brighton", "brighton and hove albion"],
  "wolverhampton wanderers": ["wolves", "wolverhampton"],
  "nottingham forest": ["forest", "notts forest"],
  "crystal palace": ["palace"],
  fulham: ["fulham fc"],
  everton: ["everton fc"],
  brentford: ["brentford fc"],
  bournemouth: ["afc bournemouth"],
  "ipswich town": ["ipswich"],
  "leicester city": ["leicester"],
  southampton: ["southampton fc", "saints"],
  "leeds united": ["leeds"],
  "coventry city": ["coventry"],
  "cambridge united": ["cambridge"],
  "bristol rovers": ["bristol r", "bristol rovers fc"],
  "oxford city": ["oxford c"],
  "oxford united": ["oxford utd", "oxford"],
  "bolton wanderers": ["bolton"],
  "derby county": ["derby"],
  // Germany
  "bayern munchen": ["bayern", "bayern munich", "fc bayern", "bayern münchen"],
  "borussia dortmund": ["dortmund", "bvb"],
  "bayer leverkusen": ["leverkusen", "bayer 04"],
  "rb leipzig": ["leipzig", "rasenballsport leipzig"],
  "borussia monchengladbach": ["borussia m'gladbach", "borussia mgladbach", "monchengladbach", "mönchengladbach", "gladbach", "bmg"],
  "borussia m'gladbach": ["borussia monchengladbach", "monchengladbach", "mönchengladbach", "gladbach", "bmg"],
  "1. fsv mainz 05": ["mainz", "fsv mainz 05", "1 fsv mainz 05", "mainz 05"],
  mainz: ["1. fsv mainz 05", "fsv mainz 05", "1 fsv mainz 05", "mainz 05"],
  "1. fc koln": ["fc koln", "koln", "cologne", "1 fc cologne", "fc cologne"],
  koln: ["1. fc koln", "1 fc koln", "fc koln", "cologne", "fc cologne"],
  cologne: ["1. fc koln", "1 fc koln", "fc koln", "koln"],
  "1. fc heidenheim": ["heidenheim", "1 fc heidenheim"],
  "1. fc union berlin": ["union berlin", "1 fc union berlin"],
  "hamburg sv": ["hamburger sv", "hamburg", "hsv"],
  "eintracht frankfurt": ["frankfurt"],
  "vfb stuttgart": ["stuttgart"],
  // Italy
  "inter milan": ["inter", "internazionale", "fc internazionale"],
  "ac milan": ["milan"],
  juventus: ["juve"],
  napoli: ["ssc napoli"],
  roma: ["as roma"],
  lazio: ["ss lazio"],
  atalanta: ["atalanta bc"],
  fiorentina: ["acf fiorentina"],
  udinese: ["udinese calcio"],
  venezia: ["venezia fc"],
  // France
  "paris saint germain": ["psg", "paris sg", "paris st germain", "paris saint-germain"],
  "olympique marseille": ["marseille", "om"],
  "olympique lyon": ["lyon", "ol", "olympique lyonnais"],
  monaco: ["as monaco"],
  lille: ["losc lille", "losc"],
  strasbourg: ["rc strasbourg", "racing strasbourg"],
  "rc lens": ["lens"],
  "stade brestois": ["stade brestois 29", "brest", "stade brest"],
  brest: ["stade brestois", "stade brestois 29", "stade brest"],
  "stade rennais": ["rennes", "stade rennes", "srfc"],
  rennes: ["stade rennais", "stade rennes", "srfc"],
  nice: ["ogc nice"],
  reims: ["stade de reims"],
  "le havre": ["le havre ac"],
  auxerre: ["aj auxerre"],
  angers: ["angers sco"],
  toulouse: ["toulouse fc"],
  // Portugal
  "sporting cp": ["sporting lisbon", "sporting", "sporting clube de portugal"],
  "sporting lisbon": ["sporting cp", "sporting", "sporting clube de portugal"],
  benfica: ["sl benfica"],
  porto: ["fc porto"],
  braga: ["sc braga"],
  // Denmark / Scandinavia
  "fc kobenhavn": ["copenhagen", "fc copenhagen", "kobenhavn", "fck"],
  copenhagen: ["fc kobenhavn", "fc copenhagen", "kobenhavn", "fck"],
  "bodo/glimt": ["bodo glimt", "bodoe glimt"],
  // Belgium
  "royale union saint-gilloise": ["union sg", "union st gilloise", "union saint-gilloise", "rusg"],
  "union sg": ["royale union saint-gilloise", "union st gilloise", "union saint-gilloise", "rusg"],
  "club brugge": ["club brugge kv", "brugge"],
  // Netherlands
  ajax: ["afc ajax"],
  psv: ["psv eindhoven"],
  feyenoord: ["feyenoord rotterdam"],
  // Scotland
  celtic: ["celtic fc", "glasgow celtic"],
  rangers: ["rangers fc", "glasgow rangers"],
  // Turkey
  galatasaray: ["galatasaray sk"],
  fenerbahce: ["fenerbahce sk"],
  besiktas: ["besiktas jk"],
  // Czech Republic
  "sk slavia praha": ["slavia prague", "slavia praha"],
  "slavia prague": ["sk slavia praha", "slavia praha"],
  "sparta praha": ["sparta prague", "sparta praha"],
  ...INTERNATIONAL_ALIASES,
}

/** Competition synonyms for bonus scoring. */
const COMPETITIONS: Record<string, string[]> = {
  "la liga": ["laliga", "liga", "primera division", "spanish league"],
  "premier league": ["epl", "premier", "english premier league"],
  "champions league": ["ucl", "uefa champions league", "champions"],
  bundesliga: ["german league", "bundesliga 1"],
  "serie a": ["italian league", "serie a tim"],
  "ligue 1": ["ligue1", "french league"],
  "fa cup": ["the fa cup", "emirates fa cup"],
  "efl championship": ["championship", "english championship"],
  ...INTERNATIONAL_COMPETITIONS,
}

/**
 * Clean and normalise a string: lowercased, unaccented, punctuation dropped.
 *
 * Memoised: matching a page of fixtures against the live feed normalises the
 * same couple of hundred club names tens of thousands of times a pass, and
 * the NFD + eight regex passes below are what that time was going into.
 */
const normalised = new Map<string, string>()
const NORMALISE_CACHE_MAX = 5_000

export function normalise(s: string): string {
  if (!s || typeof s !== "string") return ""
  const hit = normalised.get(s)
  if (hit !== undefined) return hit
  const out = normaliseUncached(s)
  // Names come from feeds, so the key space is bounded in practice; the cap is
  // only there so a pathological feed cannot grow this without limit.
  if (normalised.size >= NORMALISE_CACHE_MAX) normalised.clear()
  normalised.set(s, out)
  return out
}

function normaliseUncached(s: string): string {
  return s
    .replace(/[øØ]/g, "o")
    .replace(/[æÆ]/g, "ae")
    .replace(/[œŒ]/g, "oe")
    .replace(/[ß]/g, "ss")
    .replace(/[łŁ]/g, "l")
    .replace(/[đĐ]/g, "d")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

/** Extract non-filler tokens from a team name. */
export function extractTokens(s: string): string[] {
  return normalise(s)
    .split(/\s+/)
    .filter((t) => t && !FILLER.has(t))
}

/**
 * Bigram Dice coefficient for fuzzy matching between strings (0 to 1).
 */
export function diceSimilarity(a: string, b: string): number {
  const s1 = normalise(a).replace(/\s+/g, "")
  const s2 = normalise(b).replace(/\s+/g, "")
  if (!s1 || !s2) return 0
  if (s1 === s2) return 1

  if (s1.length === 1 || s2.length === 1) {
    return s1 === s2 ? 1 : 0
  }

  const bigrams1 = new Map<string, number>()
  for (let i = 0; i < s1.length - 1; i++) {
    const bg = s1.substring(i, i + 2)
    bigrams1.set(bg, (bigrams1.get(bg) ?? 0) + 1)
  }

  let intersection = 0
  for (let i = 0; i < s2.length - 1; i++) {
    const bg = s2.substring(i, i + 2)
    const count = bigrams1.get(bg) ?? 0
    if (count > 0) {
      bigrams1.set(bg, count - 1)
      intersection++
    }
  }

  return (2 * intersection) / (s1.length - 1 + s2.length - 1)
}

/**
 * Parse home and away teams from a StreamFree stream.
 */
export function parseStreamTeams(stream: StreamFreeItem): { home: string; away: string } {
  if (stream.team1?.name && stream.team2?.name) {
    return {
      home: stream.team1.name.trim(),
      away: stream.team2.name.trim(),
    }
  }

  // Fallback: parse from name "Home vs Away" or "Home - Away" or "Home v Away"
  const m = stream.name.match(/^(.+?)\s+(?:vs\.?|v|-)\s+(.+?)$/i)
  if (m) {
    return {
      home: m[1].trim(),
      away: m[2].trim(),
    }
  }

  return { home: stream.name.trim(), away: "" }
}

/**
 * Every spelling that maps to a canonical club, built once.
 *
 * This used to be rebuilt inside `matchesAlias` on every call — 66 canonical
 * names, each re-normalised along with its aliases and their "fc"/"cf"
 * variants, for a single yes/no answer. A name can legitimately sit in more
 * than one group, so the value is a set and a match means the two names share
 * a group, exactly as the old loop decided it.
 */
const ALIAS_GROUPS: Map<string, Set<string>> = (() => {
  const index = new Map<string, Set<string>>()
  const add = (spelling: string, canon: string) => {
    const existing = index.get(spelling)
    if (existing) existing.add(canon)
    else index.set(spelling, new Set([canon]))
  }
  for (const [canon, aliases] of Object.entries(ALIASES)) {
    for (const name of [canon, ...aliases]) {
      const n = normalise(name)
      if (!n) continue
      for (const variant of [n, `${n} fc`, `fc ${n}`, `${n} cf`, `cf ${n}`]) {
        add(variant, canon)
      }
    }
  }
  return index
})()

/** Check if a canonical name and a query match via alias map. */
function matchesAlias(nameA: string, nameB: string): boolean {
  const normA = normalise(nameA)
  const normB = normalise(nameB)
  if (normA === normB) return true

  const groupsA = ALIAS_GROUPS.get(normA)
  if (!groupsA) return false
  const groupsB = ALIAS_GROUPS.get(normB)
  if (!groupsB) return false

  for (const canon of groupsA) {
    if (groupsB.has(canon)) return true
  }
  return false
}

/**
 * Calculate similarity between two team names (0 to 1).
 */
export function teamSimilarity(teamA: string, teamB: string): number {
  if (!teamA || !teamB) return 0
  const normA = normalise(teamA)
  const normB = normalise(teamB)
  if (normA === normB) return 1.0

  if (matchesAlias(teamA, teamB)) return 0.98

  const tokensA = extractTokens(teamA)
  const tokensB = extractTokens(teamB)

  if (tokensA.length > 0 && tokensB.length > 0) {
    const setB = new Set(tokensB)
    const matches = tokensA.filter((t) => setB.has(t)).length
    const jaccard = matches / (tokensA.length + tokensB.length - matches)
    if (jaccard > 0.6) return Math.min(1.0, 0.85 + jaccard * 0.15)
  }

  const dice = diceSimilarity(normA, normB)
  return dice
}

/**
 * Check if the two competitions match.
 */
export function competitionMatch(leagueA: string, leagueB: string): boolean {
  const normA = normalise(leagueA)
  const normB = normalise(leagueB)
  if (normA === normB) return true

  for (const [canon, aliases] of Object.entries(COMPETITIONS)) {
    const all = [normalise(canon), ...aliases.map(normalise)]
    const hasA = all.some((a) => normA.includes(a) || a.includes(normA))
    const hasB = all.some((b) => normB.includes(b) || b.includes(normB))
    if (hasA && hasB) return true
  }

  return false
}

/**
 * Calculate time proximity factor between fixture and stream (0 to 1).
 * Rejects streams with a time difference greater than 24 hours.
 */
export function timeProximityFactor(
  fixture: Fixture,
  streamTimestampSeconds: number,
): number {
  if (!streamTimestampSeconds || streamTimestampSeconds <= 0) {
    return 0.8 // Neutral if stream has no timestamp
  }

  const streamMs = streamTimestampSeconds * 1000

  if (fixture.kickoff) {
    const fixtureMs = Date.parse(fixture.kickoff)
    if (!Number.isNaN(fixtureMs)) {
      const diffHours = Math.abs(streamMs - fixtureMs) / 3_600_000
      if (diffHours <= 2.5) return 1.0
      if (diffHours <= 5) return 0.85
      if (diffHours <= 12) return 0.65
      if (diffHours <= 24) return 0.4
      return 0 // Greater than 24h is rejected
    }
  }

  if (fixture.date) {
    const fixtureDate = fixture.date.slice(0, 10)
    const streamDate = new Date(streamMs).toISOString().slice(0, 10)
    if (fixtureDate === streamDate) return 0.95
    const dayDiff =
      Math.abs(Date.parse(fixtureDate) - Date.parse(streamDate)) / 86_400_000
    if (dayDiff <= 1) return 0.6
    return 0
  }

  return 0.7
}

const QUALITY_ORDER: Record<string, number> = {
  "4k": 4,
  fhd: 3,
  hd: 2,
  sd: 1,
}

/**
 * Sort qualities descending (4K > FHD > HD > SD).
 */
export function sortQualities(qualities: StreamFreeQuality[]): StreamFreeQuality[] {
  const unique = Array.from(new Set(qualities.filter(Boolean)))
  return unique.sort((a, b) => {
    const valA = QUALITY_ORDER[a.toLowerCase()] ?? 0
    const valB = QUALITY_ORDER[b.toLowerCase()] ?? 0
    return valB - valA
  })
}

/**
 * Resolve the stream's overall status based on source live flags and kickoff time.
 */
export function resolveStreamStatus(stream: StreamFreeItem): {
  status: StreamStatus
  isLive: boolean
  availableQualities: StreamFreeQuality[]
  bestSource: StreamFreeSource | null
} {
  const sources = Array.isArray(stream.sources) ? stream.sources : []
  // Only mark as LIVE when a source explicitly returns live: true
  const liveSource = sources.find((s) => s.live === true)
  const isLive = Boolean(liveSource)

  let status: StreamStatus = "OFFLINE"
  if (isLive) {
    status = "LIVE"
  } else if (stream.match_timestamp && stream.match_timestamp * 1000 > Date.now()) {
    status = "UPCOMING"
  } else {
    status = "OFFLINE"
  }

  const rawQualities = sources.map((s) => s.quality).filter(Boolean)
  const availableQualities = sortQualities(rawQualities)

  // Choose best source
  let bestSource: StreamFreeSource | null = null
  if (sources.length > 0) {
    const sorted = [...sources].sort((a, b) => {
      // Live sources first
      if (a.live !== b.live) return a.live ? -1 : 1
      const valA = QUALITY_ORDER[a.quality?.toLowerCase()] ?? 0
      const valB = QUALITY_ORDER[b.quality?.toLowerCase()] ?? 0
      return valB - valA
    })
    bestSource = sorted[0]
  }

  return { status, isLive, availableQualities, bestSource }
}

/**
 * Score association between a fixture and a StreamFree candidate (0 to 1).
 * Requires BOTH teams to match.
 */
export function scoreMatch(
  fixture: Fixture,
  stream: StreamFreeItem,
): { confidence: number; matchedTeams: { home: string; away: string } } {
  const streamTeams = parseStreamTeams(stream)
  if (!streamTeams.home || !streamTeams.away) {
    return { confidence: 0, matchedTeams: streamTeams }
  }

  // Check direct order (Home vs Away)
  const directHome = teamSimilarity(fixture.home, streamTeams.home)
  const directAway = teamSimilarity(fixture.away, streamTeams.away)

  // Check reversed order (in case provider inverted home/away)
  const reversedHome = teamSimilarity(fixture.home, streamTeams.away)
  const reversedAway = teamSimilarity(fixture.away, streamTeams.home)

  const directScore = Math.min(directHome, directAway)
  const reversedScore = Math.min(reversedHome, reversedAway) * 0.95 // Small penalty for reversed

  const isReversed = reversedScore > directScore
  const minTeamScore = isReversed ? reversedScore : directScore
  const homeScore = isReversed ? reversedHome : directHome
  const awayScore = isReversed ? reversedAway : directAway

  // Strict requirement: BOTH teams must match convincingly (at least 0.72 each)
  if (minTeamScore < 0.72) {
    return { confidence: 0, matchedTeams: streamTeams }
  }

  // Time proximity
  const timeFactor = timeProximityFactor(fixture, stream.match_timestamp)
  if (timeFactor === 0) {
    return { confidence: 0, matchedTeams: streamTeams }
  }

  // League match bonus
  const leagueBonus =
    fixture.league && stream.league && competitionMatch(fixture.league, stream.league)
      ? 0.08
      : 0.0

  const baseScore = homeScore * 0.46 + awayScore * 0.46 + leagueBonus
  const confidence = Math.min(1.0, Math.max(0, baseScore * timeFactor))

  return { confidence, matchedTeams: streamTeams }
}

/**
 * Find the best matching StreamFree stream for a fixture above the confidence threshold.
 */
export function matchFixtureToStream(
  fixture: Fixture,
  streams: StreamFreeItem[],
): MatchedStream | null {
  let bestCandidate: {
    stream: StreamFreeItem
    confidence: number
    matchedTeams: { home: string; away: string }
  } | null = null

  for (const stream of streams) {
    const { confidence, matchedTeams } = scoreMatch(fixture, stream)
    if (confidence >= CONFIDENCE_THRESHOLD) {
      if (!bestCandidate || confidence > bestCandidate.confidence) {
        bestCandidate = { stream, confidence, matchedTeams }
      }
    }
  }

  if (!bestCandidate) return null

  const { stream, confidence, matchedTeams } = bestCandidate
  const { status, isLive, availableQualities, bestSource } = resolveStreamStatus(stream)

  return {
    streamKey: stream.stream_key,
    title: stream.name,
    league: stream.league,
    matchTimestamp: stream.match_timestamp,
    status,
    isLive,
    availableQualities,
    sources: stream.sources || [],
    bestSource,
    thumbnailUrl: stream.thumbnail_url,
    confidence: Number(confidence.toFixed(2)),
    matchedTeams,
  }
}

/**
 * Match a batch of fixtures to a list of StreamFree streams.
 * Returns a Map keyed by fixture.event_id.
 */
export function matchFixtures(
  fixtures: Fixture[],
  streams: StreamFreeItem[],
): Map<number, MatchedStream> {
  const result = new Map<number, MatchedStream>()
  const claimedStreamKeys = new Set<string>()

  // Sort fixtures by date/kickoff
  for (const f of fixtures) {
    // Only search unclaimed streams or choose the highest confidence
    const candidate = matchFixtureToStream(f, streams)
    if (candidate && !claimedStreamKeys.has(candidate.streamKey)) {
      result.set(f.event_id, candidate)
      claimedStreamKeys.add(candidate.streamKey)
    }
  }

  return result
}

