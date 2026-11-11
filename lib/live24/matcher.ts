/**
 * Match Association Engine for Live24 / StreamHive.
 * Matches SofaScore fixtures with Live24 events using fuzzy team matching and alias lookup.
 */

import type { Fixture } from "../providers/types.ts"
import type { Live24ParsedEvent, MatchedLive24 } from "./types.ts"
import { INTERNATIONAL_ALIASES, matchesAliasTarget } from "../streaming/aliases.ts"

export const CONFIDENCE_REJECT_THRESHOLD = 75
export const CONFIDENCE_CONFIRMED_THRESHOLD = 85

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
  "club",
  "de",
  "futbol",
  "football",
  "calcio",
  "w",
  "women",
  "the",
])

const ALIASES: Record<string, string[]> = {
  barcelona: ["barca", "fc barcelona", "barcelona fc", "fcb"],
  "real madrid": ["real madrid cf", "los blancos"],
  "atletico madrid": ["atleti", "atletico de madrid", "atlético madrid"],
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
  "bayern munich": ["bayern", "fc bayern", "bayern munchen"],
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
  "paris saint germain": ["psg", "paris sg", "paris", "paris saint-germain"],
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
  "manchester united": ["man united", "man utd", "mufc"],
  "manchester city": ["man city", "mcfc"],
  liverpool: ["lfc"],
  arsenal: ["afc", "the gunners"],
  chelsea: ["cfc", "the blues"],
  tottenham: ["spurs", "tottenham hotspur", "thfc"],
  "west ham": ["west ham united", "whufc"],
  wolves: ["wolverhampton", "wolverhampton wanderers"],
  brighton: ["brighton and hove albion", "bhafc"],
  juventus: ["juve"],
  inter: ["inter milan", "internazionale"],
  milan: ["ac milan"],
  atalanta: ["atalanta bc"],
  roma: ["as roma"],
  lazio: ["ss lazio"],
  napoli: ["ssc napoli"],
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

export function cleanTeamName(name: string): string {
  if (!name) return ""
  return name
    .replace(/[øØ]/g, "o")
    .replace(/[æÆ]/g, "ae")
    .replace(/[œŒ]/g, "oe")
    .replace(/[ß]/g, "ss")
    .replace(/[łŁ]/g, "l")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 0 && !FILLER_WORDS.has(word))
    .join(" ")
    .trim()
}

export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  const row = Array.from({ length: b.length + 1 }, (_, i) => i)

  for (let i = 1; i <= a.length; i++) {
    let prev = i
    for (let j = 1; j <= b.length; j++) {
      const val = a[i - 1] === b[j - 1] ? row[j - 1] : Math.min(row[j - 1], prev, row[j]) + 1
      row[j - 1] = prev
      prev = val
    }
    row[b.length] = prev
  }

  return row[b.length]
}

export function stringSimilarity(a: string, b: string): number {
  if (a === b) return 1.0
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return 1.0
  const dist = levenshteinDistance(a, b)
  return 1 - dist / maxLen
}

export function areAliases(nameA: string, nameB: string): boolean {
  const normA = cleanTeamName(nameA)
  const normB = cleanTeamName(nameB)
  if (normA === normB) return true

  for (const [canonical, aliasList] of Object.entries(ALIASES)) {
    const group = [canonical, ...aliasList].map(cleanTeamName)
    if (group.some((a) => matchesAliasTarget(normA, a)) && group.some((b) => matchesAliasTarget(normB, b))) {
      return true
    }
  }
  return false
}

export function matchTeamNames(nameA: string, nameB: string): number {
  if (!nameA || !nameB) return 0
  const normA = cleanTeamName(nameA)
  const normB = cleanTeamName(nameB)

  if (normA === normB) return 100
  if (areAliases(nameA, nameB)) return 95

  if (normA.includes(normB) || normB.includes(normA)) {
    const minLen = Math.min(normA.length, normB.length)
    const maxLen = Math.max(normA.length, normB.length)
    return Math.round(85 + (minLen / maxLen) * 15)
  }

  const wordsA = new Set(normA.split(/\s+/))
  const wordsB = new Set(normB.split(/\s+/))
  let overlap = 0
  for (const w of wordsA) {
    if (wordsB.has(w)) overlap++
  }
  if (overlap > 0) {
    const jaccard = overlap / (wordsA.size + wordsB.size - overlap)
    if (jaccard >= 0.5) return Math.round(75 + jaccard * 20)
  }

  const sim = stringSimilarity(normA, normB)
  return Math.round(sim * 100)
}

export function calculateConfidence(
  fixture: Fixture,
  event: Live24ParsedEvent,
): { confidence: number; isConfirmed: boolean } {
  const homeScore = matchTeamNames(fixture.home, event.homeTeam)
  const awayScore = matchTeamNames(fixture.away, event.awayTeam)

  const homeSwapped = matchTeamNames(fixture.home, event.awayTeam)
  const awaySwapped = matchTeamNames(fixture.away, event.homeTeam)

  const standardBoth = homeScore >= 60 && awayScore >= 60
  const swappedBoth = homeSwapped >= 60 && awaySwapped >= 60

  let effectiveHome = 0
  let effectiveAway = 0

  if (standardBoth && swappedBoth) {
    if (homeScore + awayScore >= homeSwapped + awaySwapped) {
      effectiveHome = homeScore
      effectiveAway = awayScore
    } else {
      effectiveHome = homeSwapped
      effectiveAway = awaySwapped
    }
  } else if (standardBoth) {
    effectiveHome = homeScore
    effectiveAway = awayScore
  } else if (swappedBoth) {
    effectiveHome = homeSwapped
    effectiveAway = awaySwapped
  } else {
    // Check if event name contains both team names
    const eventName = cleanTeamName(event.rawName || `${event.homeTeam} vs ${event.awayTeam}`)
    const normHome = cleanTeamName(fixture.home)
    const normAway = cleanTeamName(fixture.away)
    const containsBoth =
      (eventName.includes(normHome) || matchTeamNames(normHome, eventName) >= 60) &&
      (eventName.includes(normAway) || matchTeamNames(normAway, eventName) >= 60)

    if (!containsBoth) {
      return { confidence: 0, isConfirmed: false }
    }
    effectiveHome = 80
    effectiveAway = 80
  }

  let total = (effectiveHome + effectiveAway) / 2

  // Slight boost if competition name matches
  if (event.competition && fixture.league) {
    const normComp = cleanTeamName(event.competition)
    const normLeague = cleanTeamName(fixture.league)
    if (normComp.includes(normLeague) || normLeague.includes(normComp)) {
      total = Math.min(100, total + 5)
    }
  }

  const confidence = Math.round(total)
  const isConfirmed = confidence >= CONFIDENCE_CONFIRMED_THRESHOLD

  return { confidence, isConfirmed }
}

export function matchFixtureToLive24(
  fixture: Fixture,
  events: Live24ParsedEvent[],
): MatchedLive24 | null {
  if (!events || events.length === 0) return null

  let bestMatch: Live24ParsedEvent | null = null
  let bestConfidence = 0
  let bestConfirmed = false

  for (const event of events) {
    const { confidence, isConfirmed } = calculateConfidence(fixture, event)
    if (confidence > bestConfidence && confidence >= CONFIDENCE_REJECT_THRESHOLD) {
      bestConfidence = confidence
      bestMatch = event
      bestConfirmed = isConfirmed
    }
  }

  if (!bestMatch) return null

  return {
    event_id: fixture.event_id,
    fixture: {
      home: fixture.home,
      away: fixture.away,
      league: fixture.league,
      date: fixture.date,
    },
    event: bestMatch,
    isConfirmedMatch: bestConfirmed,
    matchConfidence: bestConfidence,
  }
}

export function matchFixturesToLive24(
  fixtures: Fixture[],
  events: Live24ParsedEvent[],
): Record<number, MatchedLive24> {
  const result: Record<number, MatchedLive24> = {}
  for (const f of fixtures) {
    const matched = matchFixtureToLive24(f, events)
    if (matched) {
      result[f.event_id] = matched
    }
  }
  return result
}

