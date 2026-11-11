import type { Fixture } from "../providers/types.ts"
import type { MatchedZLive, ZLiveChannel } from "./types.ts"
import {
  normalise,
  diceSimilarity,
  teamSimilarity,
} from "../streamfree/matcher.ts"

export const CONFIDENCE_THRESHOLD = 0.75

/** Check if channel title specifically pairs both teams (e.g. "Arsenal vs Chelsea") */
function matchesBothTeams(
  channelName: string,
  fixture: Fixture,
): { matches: boolean; score: number } {
  const normChannel = normalise(channelName)
  const normHome = normalise(fixture.home)
  const normAway = normalise(fixture.away)

  const hasHome =
    normChannel.includes(normHome) ||
    diceSimilarity(normChannel, normHome) >= 0.7 ||
    teamSimilarity(fixture.home, channelName) >= 0.75

  const hasAway =
    normChannel.includes(normAway) ||
    diceSimilarity(normChannel, normAway) >= 0.7 ||
    teamSimilarity(fixture.away, channelName) >= 0.75

  if (hasHome && hasAway) {
    const score = 0.85 + (diceSimilarity(normChannel, `${normHome} ${normAway}`) * 0.1)
    return { matches: true, score: Math.min(score, 0.98) }
  }

  return { matches: false, score: 0 }
}

/**
 * Match a single fixture against all available ZLive channels.
 * Fixtures ONLY match confirmed matches where BOTH teams are explicitly paired.
 * Generic 24/7 channels belong solely in the 24/7 channels shelf.
 */
export function matchFixtureToZLive(
  fixture: Fixture,
  channels: ZLiveChannel[],
): MatchedZLive | null {
  if (!channels || channels.length === 0) return null

  let bestConfirmed: MatchedZLive | null = null
  let maxConfirmedScore = 0

  for (const ch of channels) {
    const { matches, score } = matchesBothTeams(ch.name, fixture)
    if (matches && score >= CONFIDENCE_THRESHOLD && score > maxConfirmedScore) {
      maxConfirmedScore = score
      bestConfirmed = {
        channel: ch,
        confidence: score,
        isConfirmedMatch: true,
        isGenericBroadcaster: false,
      }
    }
  }

  return bestConfirmed
}

/**
 * Match an array of fixtures against ZLive channels.
 */
export function matchFixturesToZLive(
  fixtures: Fixture[],
  channels: ZLiveChannel[],
): Map<number, MatchedZLive> {
  const result = new Map<number, MatchedZLive>()
  for (const f of fixtures) {
    const matched = matchFixtureToZLive(f, channels)
    if (matched) {
      result.set(f.event_id, matched)
    }
  }
  return result
}

