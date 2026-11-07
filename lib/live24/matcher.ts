/**
 * Match Association Engine for Live24 / StreamHive.
 * Matches SofaScore fixtures with Live24 events using fuzzy team matching and alias lookup.
 */

import type { Fixture } from "@/lib/providers/types"
import type { Live24ParsedEvent, MatchedLive24 } from "./types"

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
  "bayern munich": ["bayern", "fc bayern", "bayern munchen"],
  "borussia dortmund": ["dortmund", "bvb"],
  "paris saint germain": ["psg", "paris sg", "paris"],
  "manchester united": ["man united", "man utd", "mufc"],
  "manchester city": ["man city", "mcfc"],
  liverpool: ["lfc"],
  arsenal: ["afc", "the gunners"],
  chelsea: ["cfc", "the blues"],
  juventus: ["juve"],
  inter: ["inter milan", "internazionale"],
  milan: ["ac milan"],
}

export function cleanTeamName(name: string): string {
  if (!name) return ""
  return name
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
    if (group.includes(normA) && group.includes(normB)) {
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

  if (homeScore < 60 || awayScore < 60) {
    return { confidence: 0, isConfirmed: false }
  }

  let total = (homeScore + awayScore) / 2

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
