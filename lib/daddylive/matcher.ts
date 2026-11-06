import type { Fixture } from "@/lib/providers/types"
import type { DaddyLiveParsedEvent, MatchedDaddyLive } from "./types"
import { normalise, diceSimilarity } from "@/lib/streamfree/matcher"

export const CONFIDENCE_REJECTION_THRESHOLD = 75
export const CONFIDENCE_CONFIRMED_THRESHOLD = 85

/** Canonical club aliases. */
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
  valladolid: ["real valladolid"],
  leganes: ["cd leganes"],
  arsenal: ["arsenal fc", "afc"],
  "aston villa": ["villa", "avfc"],
  chelsea: ["chelsea fc", "cfc"],
  liverpool: ["liverpool fc", "lfc"],
  "manchester city": ["man city", "mancity", "mcfc"],
  "manchester united": ["man utd", "man united", "mufc"],
  newcastle: ["newcastle united", "nufc"],
  tottenham: ["spurs", "tottenham hotspur", "thfc"],
  west_ham: ["west ham united", "whufc"],
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
  "bayern munich": ["bayern", "fc bayern", "fc bayern munchen"],
  "borussia dortmund": ["dortmund", "bvb"],
  "rb leipzig": ["leipzig", "rbl"],
  "bayer leverkusen": ["leverkusen", "bayer 04"],
  inter: ["internazionale", "inter milan"],
  milan: ["ac milan"],
  juventus: ["juve"],
  napoli: ["ssc napoli"],
  roma: ["as roma"],
  lazio: ["ss lazio"],
  atalanta: ["atalanta bc"],
}

/** Check if two team names match (via direct equality, substring, aliases, or fuzzy dice similarity) */
function teamSimilarity(fixtureTeam: string, eventTeam: string): number {
  const normA = normalise(fixtureTeam)
  const normB = normalise(eventTeam)

  if (!normA || !normB) return 0
  if (normA === normB) return 1.0

  // Check alias dictionary
  for (const [canon, aliases] of Object.entries(ALIASES)) {
    const canonNorm = normalise(canon)
    const all = [canonNorm, ...aliases.map(normalise)]
    const matchesA = all.some((a) => a === normA || normA.includes(a) || a.includes(normA))
    const matchesB = all.some((b) => b === normB || normB.includes(b) || b.includes(normB))
    if (matchesA && matchesB) return 0.98
  }

  // Token inclusion (e.g. "Atletico Madrid" vs "Atletico")
  if (normA.includes(normB) || normB.includes(normA)) {
    return 0.88
  }

  // Dice coefficient
  return diceSimilarity(normA, normB)
}

/**
 * Match a SofaScore fixture against an array of DaddyLive schedule events.
 * Strictly enforces that BOTH teams must match.
 * Generates confidence score (0-100).
 * Associations below 75 are rejected.
 */
export function matchFixtureToDaddyLive(
  fixture: Fixture,
  events: DaddyLiveParsedEvent[],
): MatchedDaddyLive | null {
  if (!events || events.length === 0) return null

  let bestMatch: MatchedDaddyLive | null = null
  let highestScore = 0

  for (const ev of events) {
    // 1. Evaluate home and away similarity (standard order)
    const homeSim = teamSimilarity(fixture.home, ev.home)
    const awaySim = teamSimilarity(fixture.away, ev.away)

    // Also test swapped order (in case schedule lists away vs home)
    const homeSwappedSim = teamSimilarity(fixture.home, ev.away)
    const awaySwappedSim = teamSimilarity(fixture.away, ev.home)

    let standardBoth = homeSim >= 0.70 && awaySim >= 0.70
    let swappedBoth = homeSwappedSim >= 0.70 && awaySwappedSim >= 0.70

    // Strict requirement: BOTH teams must match. If only one matches, reject this event.
    if (!standardBoth && !swappedBoth) {
      // Also check full event raw title containing both team names
      const normRaw = normalise(ev.rawTitle)
      const normHome = normalise(fixture.home)
      const normAway = normalise(fixture.away)
      if (
        (normRaw.includes(normHome) || diceSimilarity(normRaw, normHome) >= 0.7) &&
        (normRaw.includes(normAway) || diceSimilarity(normRaw, normAway) >= 0.7)
      ) {
        standardBoth = true
      } else {
        continue
      }
    }

    const teamScore = standardBoth
      ? (homeSim + awaySim) / 2
      : (homeSwappedSim + awaySwappedSim) / 2

    // 2. Kickoff proximity weighting
    let proximityMultiplier = 1.0
    if (fixture.kickoff && ev.kickoffIso) {
      const fixTime = new Date(fixture.kickoff).getTime()
      const evTime = new Date(ev.kickoffIso).getTime()
      const diffHours = Math.abs(fixTime - evTime) / 3_600_000

      if (diffHours <= 1.5) {
        proximityMultiplier = 1.0
      } else if (diffHours <= 3.0) {
        proximityMultiplier = 0.92
      } else if (diffHours <= 6.0) {
        proximityMultiplier = 0.80
      } else {
        // Discrepancy > 6 hours on the same fixture -> reject
        continue
      }
    } else if (fixture.date && ev.kickoffIso) {
      // Verify same date
      const fixDate = fixture.date.slice(0, 10)
      const evDate = ev.kickoffIso.slice(0, 10)
      if (fixDate !== evDate) {
        proximityMultiplier = 0.82
      }
    }

    // Compute final confidence on 0-100 scale
    const rawConfidence = teamScore * proximityMultiplier * 100
    const confidence = Math.min(Math.round(rawConfidence), 100)

    // Rejection threshold: reject if below 75
    if (confidence < CONFIDENCE_REJECTION_THRESHOLD) {
      continue
    }

    if (confidence > highestScore) {
      highestScore = confidence
      bestMatch = {
        event: ev,
        confidence,
        isConfirmedMatch: confidence >= CONFIDENCE_CONFIRMED_THRESHOLD,
        channels: ev.channels,
      }
    }
  }

  return bestMatch
}

/**
 * Match an array of SofaScore fixtures against DaddyLive schedule events.
 */
export function matchFixturesToDaddyLive(
  fixtures: Fixture[],
  events: DaddyLiveParsedEvent[],
): Map<number, MatchedDaddyLive> {
  const result = new Map<number, MatchedDaddyLive>()
  for (const f of fixtures) {
    const matched = matchFixtureToDaddyLive(f, events)
    if (matched) {
      result.set(f.event_id, matched)
    }
  }
  return result
}

