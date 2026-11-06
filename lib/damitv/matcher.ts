import type { Fixture } from "@/lib/providers/types"
import type { DamiTvParsedStream, MatchedDamiTv } from "./types"
import { normalise, diceSimilarity } from "@/lib/streamfree/matcher"

export const CONFIDENCE_REJECTION_THRESHOLD = 75
export const CONFIDENCE_CONFIRMED_THRESHOLD = 85

/** Canonical club aliases. */
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

/** Check if two team names match (via direct equality, substring, aliases, or fuzzy similarity) */
function teamSimilarity(fixtureTeam: string, streamTeam: string): number {
  const normA = normalise(fixtureTeam)
  const normB = normalise(streamTeam)

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

  // Token inclusion (e.g. "Macarthur FC" vs "Macarthur")
  if (normA.includes(normB) || normB.includes(normA)) {
    return 0.88
  }

  return diceSimilarity(normA, normB)
}

/**
 * Match a single SofaScore fixture against an array of DAMITV streams.
 * Strictly requires BOTH teams to match.
 * Generates confidence score (0-100).
 * Rejects associations below 75.
 */
export function matchFixtureToDamiTv(
  fixture: Fixture,
  streams: DamiTvParsedStream[],
): MatchedDamiTv | null {
  if (!streams || streams.length === 0) return null

  let bestMatch: MatchedDamiTv | null = null
  let highestScore = 0

  for (const stream of streams) {
    // 1. Evaluate team similarities (standard vs swapped order)
    const homeSim = teamSimilarity(fixture.home, stream.home)
    const awaySim = teamSimilarity(fixture.away, stream.away)

    const homeSwappedSim = teamSimilarity(fixture.home, stream.away)
    const awaySwappedSim = teamSimilarity(fixture.away, stream.home)

    let standardBoth = homeSim >= 0.70 && awaySim >= 0.70
    let swappedBoth = homeSwappedSim >= 0.70 && awaySwappedSim >= 0.70

    // Strict requirement: BOTH teams must match. If only one matches, reject this stream candidate.
    if (!standardBoth && !swappedBoth) {
      // Also check full stream name containing both team names
      const normStreamName = normalise(stream.name)
      const normHome = normalise(fixture.home)
      const normAway = normalise(fixture.away)

      if (
        (normStreamName.includes(normHome) || diceSimilarity(normStreamName, normHome) >= 0.7) &&
        (normStreamName.includes(normAway) || diceSimilarity(normStreamName, normAway) >= 0.7)
      ) {
        standardBoth = true
      } else {
        continue
      }
    }

    const teamScore = standardBoth
      ? (homeSim + awaySim) / 2
      : (homeSwappedSim + awaySwappedSim) / 2

    // 2. Proximity & timestamp verification
    let proximityMultiplier = 1.0

    if (fixture.kickoff && stream.startsAt > 0) {
      const fixTime = new Date(fixture.kickoff).getTime() / 1000
      const diffHours = Math.abs(fixTime - stream.startsAt) / 3600

      if (diffHours <= 1.5) {
        proximityMultiplier = 1.0
      } else if (diffHours <= 3.5) {
        proximityMultiplier = 0.92
      } else if (diffHours <= 6.0) {
        proximityMultiplier = 0.80
      } else {
        // More than 6 hours difference -> reject match
        continue
      }
    } else if (fixture.date && stream.kickoffIso) {
      const fixDate = fixture.date.slice(0, 10)
      const streamDate = stream.kickoffIso.slice(0, 10)
      if (fixDate !== streamDate) {
        proximityMultiplier = 0.82
      }
    }

    // 3. League / competition bonus
    let leagueBonus = 0
    if (fixture.league && stream.league) {
      const normFixLeague = normalise(fixture.league)
      const normStreamLeague = normalise(stream.league)
      if (
        normFixLeague.includes(normStreamLeague) ||
        normStreamLeague.includes(normFixLeague) ||
        diceSimilarity(normFixLeague, normStreamLeague) >= 0.6
      ) {
        leagueBonus = 3
      }
    }

    // Compute final confidence (0 - 100)
    const rawConfidence = teamScore * proximityMultiplier * 100 + leagueBonus
    const confidence = Math.min(Math.round(rawConfidence), 100)

    // Rejection threshold: reject if below 75
    if (confidence < CONFIDENCE_REJECTION_THRESHOLD) {
      continue
    }

    if (confidence > highestScore) {
      highestScore = confidence
      bestMatch = {
        stream,
        confidence,
        isConfirmedMatch: confidence >= CONFIDENCE_CONFIRMED_THRESHOLD,
        activeSource: stream.sources[0],
      }
    }
  }

  return bestMatch
}

/**
 * Match an array of SofaScore fixtures against DAMITV streams.
 */
export function matchFixturesToDamiTv(
  fixtures: Fixture[],
  streams: DamiTvParsedStream[],
): Map<number, MatchedDamiTv> {
  const result = new Map<number, MatchedDamiTv>()
  for (const f of fixtures) {
    const matched = matchFixtureToDamiTv(f, streams)
    if (matched) {
      result.set(f.event_id, matched)
    }
  }
  return result
}
