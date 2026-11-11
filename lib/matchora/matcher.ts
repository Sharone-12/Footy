/**
 * Match Association Engine for Matchora.
 * Matches SofaScore fixtures with Matchora football events using
 * fuzzy team matching, alias lookup, competition verification, and UTC kickoff timing.
 */

import type { Fixture } from "../providers/types.ts"
import type { MatchoraParsedEvent, MatchedMatchora } from "./types.ts"
import { INTERNATIONAL_ALIASES, matchesAliasTarget } from "../streaming/aliases.ts"

export const CONFIDENCE_REJECT_THRESHOLD = 75
export const CONFIDENCE_CONFIRMED_THRESHOLD = 85

/** Words to strip when normalizing team names */
const FILLER_WORDS = new Set([
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

/** Canonical club aliases across major European leagues */
const ALIASES: Record<string, string[]> = {
  barcelona: ["barca", "fc barcelona", "barcelona fc", "fcb"],
  "real madrid": ["real madrid cf", "los blancos"],
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
  valladolid: ["real valladolid"],
  leganes: ["cd leganes"],
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
  arsenal: ["arsenal fc", "afc"],
  "aston villa": ["villa", "avfc"],
  chelsea: ["chelsea fc", "cfc"],
  liverpool: ["liverpool fc", "lfc"],
  "manchester city": ["man city", "mancity", "mcfc"],
  "manchester united": ["man utd", "man united", "mufc"],
  newcastle: ["newcastle united", "nufc"],
  tottenham: ["spurs", "tottenham hotspur", "thfc"],
  "west ham": ["west ham united", "whufc"],
  wolves: ["wolverhampton", "wolverhampton wanderers"],
  everton: ["everton fc"],
  fulham: ["fulham fc"],
  brighton: ["brighton and hove albion", "bhafc"],
  brentford: ["brentford fc"],
  "crystal palace": ["palace", "cpfc"],
  "nottingham forest": ["forest", "nffc"],
  bournemouth: ["afc bournemouth"],
  leicester: ["leicester city", "lcfc"],
  ipswich: ["ipswich town"],
  southampton: ["southampton fc", "saints"],
  "paris saint-germain": ["psg", "paris sg", "paris saint germain"],
  marseille: ["om", "olympique de marseille"],
  monaco: ["as monaco"],
  lyon: ["ol", "olympique lyonnais"],
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
  "bayern munich": ["bayern", "fc bayern", "fc bayern munchen"],
  "borussia dortmund": ["dortmund", "bvb"],
  "rb leipzig": ["leipzig", "rbl"],
  "bayer leverkusen": ["leverkusen", "bayer 04"],
  "borussia monchengladbach": ["borussia m'gladbach", "borussia mgladbach", "monchengladbach", "mönchengladbach", "gladbach", "bmg"],
  "borussia m'gladbach": ["borussia monchengladbach", "monchengladbach", "mönchengladbach", "gladbach", "bmg"],
  "1. fsv mainz 05": ["mainz", "fsv mainz 05", "1 fsv mainz 05", "mainz 05"],
  mainz: ["1. fsv mainz 05", "fsv mainz 05", "1 fsv mainz 05", "mainz 05"],
  "1. fc koln": ["fc koln", "koln", "cologne", "1 fc cologne", "fc cologne"],
  koln: ["1. fc koln", "1 fc koln", "fc koln", "cologne", "fc cologne"],
  cologne: ["1. fc koln", "1 fc koln", "fc koln", "koln"],
  "1. fc heidenheim": ["heidenheim", "1 fc heidenheim"],
  "1. fc union berlin": ["union berlin", "1 fc union berlin"],
  inter: ["internazionale", "inter milan"],
  milan: ["ac milan"],
  juventus: ["juve"],
  napoli: ["ssc napoli"],
  roma: ["as roma"],
  lazio: ["ss lazio"],
  atalanta: ["atalanta bc"],
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

export function normalise(text: string | null | undefined): string {
  if (!text) return ""
  return text
    .replace(/[øØ]/g, "o")
    .replace(/[æÆ]/g, "ae")
    .replace(/[œŒ]/g, "oe")
    .replace(/[ß]/g, "ss")
    .replace(/[łŁ]/g, "l")
    .replace(/[đĐ]/g, "d")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['"’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((w) => !FILLER_WORDS.has(w))
    .join(" ")
}

export function diceSimilarity(a: string, b: string): number {
  if (a === b) return 1.0
  if (a.length < 2 || b.length < 2) return 0.0

  const getBigrams = (str: string): Map<string, number> => {
    const map = new Map<string, number>()
    for (let i = 0; i < str.length - 1; i++) {
      const bg = str.slice(i, i + 2)
      map.set(bg, (map.get(bg) || 0) + 1)
    }
    return map
  }

  const bgA = getBigrams(a)
  const bgB = getBigrams(b)

  let intersection = 0
  for (const [bg, countA] of bgA.entries()) {
    const countB = bgB.get(bg) || 0
    intersection += Math.min(countA, countB)
  }

  const total = a.length - 1 + (b.length - 1)
  return (2 * intersection) / total
}

export function teamSimilarity(fixtureTeam: string, eventTeam: string): number {
  const normA = normalise(fixtureTeam)
  const normB = normalise(eventTeam)

  if (!normA || !normB) return 0
  if (normA === normB) return 1.0

  // 1. Check alias dictionary
  for (const [canon, aliases] of Object.entries(ALIASES)) {
    const canonNorm = normalise(canon)
    const all = [canonNorm, ...aliases.map(normalise)].filter((a) => a && a.length >= 3)
    const matchesA = all.some((a) => matchesAliasTarget(normA, a))
    const matchesB = all.some((b) => matchesAliasTarget(normB, b))
    if (matchesA && matchesB) {
      return 0.98
    }
  }

  // 2. Token inclusion (boundary-checked)
  if (normA.length >= 4 && normB.length >= 4) {
    if (
      normA.startsWith(`${normB} `) ||
      normA.endsWith(` ${normB}`) ||
      normB.startsWith(`${normA} `) ||
      normB.endsWith(` ${normA}`)
    ) {
      return 0.9
    }
  }

  // 3. Fuzzy similarity
  return diceSimilarity(normA, normB)
}

export function leagueSimilarity(fixtureLeague: string, eventLeague: string | null): number {
  if (!eventLeague) return 0.5
  const normA = normalise(fixtureLeague)
  const normB = normalise(eventLeague)
  if (!normA || !normB) return 0.5
  if (normA === normB) return 1.0
  if (normA.includes(normB) || normB.includes(normA)) return 0.9
  return diceSimilarity(normA, normB)
}

export function timeProximityScore(
  fixtureKickoff: string | null,
  fixtureDate: string,
  event: MatchoraParsedEvent,
): { dateMatch: boolean; timeDiffMinutes: number | null; score: number } {
  if (fixtureKickoff && event.kickoff > 0) {
    const fixMs = new Date(fixtureKickoff).getTime()
    const diffMs = Math.abs(fixMs - event.kickoff)
    const diffMinutes = Math.floor(diffMs / 60_000)

    if (diffMinutes <= 120) {
      return { dateMatch: true, timeDiffMinutes: diffMinutes, score: 1.0 }
    }
    if (diffMinutes <= 360) {
      return { dateMatch: true, timeDiffMinutes: diffMinutes, score: 0.75 }
    }
    if (diffMinutes <= 1440) {
      return { dateMatch: true, timeDiffMinutes: diffMinutes, score: 0.4 }
    }
    return { dateMatch: false, timeDiffMinutes: diffMinutes, score: 0.0 }
  }

  const fixDate = (fixtureDate || "").slice(0, 10)
  const eventDate = event.dateIso.slice(0, 10)

  if (fixDate && eventDate && fixDate === eventDate) {
    return { dateMatch: true, timeDiffMinutes: null, score: 0.85 }
  }

  return { dateMatch: false, timeDiffMinutes: null, score: 0.2 }
}

export function computeMatchScore(
  fixture: Fixture,
  event: MatchoraParsedEvent,
): { confidence: number; isConfirmed: boolean } {
  // 1. Team similarities (support standard & inverted/swapped home-away)
  const homeSim = teamSimilarity(fixture.home, event.home)
  const awaySim = teamSimilarity(fixture.away, event.away)

  const homeSwappedSim = teamSimilarity(fixture.home, event.away)
  const awaySwappedSim = teamSimilarity(fixture.away, event.home)

  const standardBoth = homeSim >= 0.65 && awaySim >= 0.65
  const swappedBoth = homeSwappedSim >= 0.65 && awaySwappedSim >= 0.65

  let effectiveHomeSim = 0
  let effectiveAwaySim = 0

  if (standardBoth && swappedBoth) {
    if (homeSim + awaySim >= homeSwappedSim + awaySwappedSim) {
      effectiveHomeSim = homeSim
      effectiveAwaySim = awaySim
    } else {
      effectiveHomeSim = homeSwappedSim
      effectiveAwaySim = awaySwappedSim
    }
  } else if (standardBoth) {
    effectiveHomeSim = homeSim
    effectiveAwaySim = awaySim
  } else if (swappedBoth) {
    effectiveHomeSim = homeSwappedSim
    effectiveAwaySim = awaySwappedSim
  } else {
    // Also check event title containing both team names
    const eventTitle = normalise(`${event.home} vs ${event.away}`)
    const normHome = normalise(fixture.home)
    const normAway = normalise(fixture.away)
    const containsBoth =
      (eventTitle.includes(normHome) || diceSimilarity(eventTitle, normHome) >= 0.65) &&
      (eventTitle.includes(normAway) || diceSimilarity(eventTitle, normAway) >= 0.65)

    if (!containsBoth) {
      return { confidence: 0, isConfirmed: false }
    }
    effectiveHomeSim = 0.8
    effectiveAwaySim = 0.8
  }

  const timeInfo = timeProximityScore(fixture.kickoff, fixture.date, event)
  if (!timeInfo.dateMatch) {
    return { confidence: 0, isConfirmed: false }
  }

  const lgSim = leagueSimilarity(fixture.league, event.league)

  const teamBase = ((effectiveHomeSim + effectiveAwaySim) / 2) * 70
  const timeWeight = timeInfo.score * 20
  const leagueWeight = lgSim * 10

  let totalScore = Math.round(teamBase + timeWeight + leagueWeight)

  if (effectiveHomeSim >= 0.95 && effectiveAwaySim >= 0.95 && timeInfo.score >= 0.8) {
    totalScore = Math.max(totalScore, 96)
  }

  totalScore = Math.min(100, Math.max(0, totalScore))

  return {
    confidence: totalScore,
    isConfirmed: totalScore >= CONFIDENCE_CONFIRMED_THRESHOLD,
  }
}

export function matchFixtureToMatchora(
  fixture: Fixture,
  events: MatchoraParsedEvent[],
): MatchedMatchora | null {
  if (!fixture || !events || !events.length) return null

  let bestMatch: MatchoraParsedEvent | null = null
  let highestScore = 0

  for (const event of events) {
    const { confidence } = computeMatchScore(fixture, event)
    if (confidence > highestScore) {
      highestScore = confidence
      bestMatch = event
    }
  }

  if (!bestMatch || highestScore < CONFIDENCE_REJECT_THRESHOLD) {
    return null
  }

  return {
    confidence: highestScore,
    event: bestMatch,
    channel: bestMatch.channels.length > 0 ? bestMatch.channels[0] : undefined,
  }
}

export function matchFixturesToMatchora(
  fixtures: Fixture[],
  events: MatchoraParsedEvent[],
): Map<number, MatchedMatchora> {
  const result = new Map<number, MatchedMatchora>()
  for (const f of fixtures) {
    const matched = matchFixtureToMatchora(f, events)
    if (matched) {
      result.set(f.event_id, matched)
    }
  }
  return result
}
