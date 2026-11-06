import type { Fixture } from "@/lib/providers/types"
import type { MatchedZLive, ZLiveChannel } from "./types"
import {
  normalise,
  diceSimilarity,
} from "@/lib/streamfree/matcher"

export const CONFIDENCE_THRESHOLD = 0.75

/** Known league/broadcaster correlations for generic channels */
const LEAGUE_BROADCASTER_HINTS: Record<string, string[]> = {
  "la liga": ["laliga", "movistar", "dazn", "espn", "supersport laliga", "bein"],
  "premier league": ["premier", "epl", "sky sports premier", "supersport premier", "nbc", "peacock", "tnt sports"],
  "champions league": ["champions", "ucl", "tnt sports", "cbs", "paramount", "bein", "supersport"],
  bundesliga: ["bundesliga", "sky sport bundesliga", "sony sports"],
  "serie a": ["serie a", "dazn", "cbs", "paramount", "tnt sports"],
  "ligue 1": ["ligue 1", "bein", "dazn"],
}

/** Check if channel title specifically pairs both teams (e.g. "Arsenal vs Chelsea") */
function matchesBothTeams(
  channelName: string,
  fixture: Fixture,
): { matches: boolean; score: number } {
  const normChannel = normalise(channelName)
  const normHome = normalise(fixture.home)
  const normAway = normalise(fixture.away)

  const hasHome =
    normChannel.includes(normHome) || diceSimilarity(normChannel, normHome) >= 0.7
  const hasAway =
    normChannel.includes(normAway) || diceSimilarity(normChannel, normAway) >= 0.7

  if (hasHome && hasAway) {
    const score = 0.85 + (diceSimilarity(normChannel, `${normHome} ${normAway}`) * 0.1)
    return { matches: true, score: Math.min(score, 0.98) }
  }

  return { matches: false, score: 0 }
}

/** Check if channel is a generic league-specific broadcaster */
function matchesLeagueBroadcaster(
  channelName: string,
  leagueName: string,
): boolean {
  const normChannel = normalise(channelName)
  const normLeague = normalise(leagueName)

  for (const [leagueKey, hints] of Object.entries(LEAGUE_BROADCASTER_HINTS)) {
    if (normLeague.includes(leagueKey) || leagueKey.includes(normLeague)) {
      if (hints.some((h) => normChannel.includes(h))) {
        return true
      }
    }
  }

  return false
}

/**
 * Match a single fixture against all available ZLive channels.
 * Prioritizes confirmed fixture matches, then league-specific channels, then generic football channels.
 */
export function matchFixtureToZLive(
  fixture: Fixture,
  channels: ZLiveChannel[],
): MatchedZLive | null {
  if (!channels || channels.length === 0) return null

  // 1. First pass: look for confirmed match where both teams are mentioned
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

  if (bestConfirmed) {
    return bestConfirmed
  }

  // 2. Second pass: look for league-specific generic broadcaster
  for (const ch of channels) {
    if (matchesLeagueBroadcaster(ch.name, fixture.league)) {
      return {
        channel: ch,
        confidence: 0.65,
        isConfirmedMatch: false,
        isGenericBroadcaster: true,
      }
    }
  }

  // 3. Third pass: fallback to high-quality general football broadcaster (if live)
  const generalFootballBroadcaster = channels.find((ch) => {
    const n = ch.name.toLowerCase()
    return (
      ch.live &&
      (n.includes("football") || n.includes("soccer") || n.includes("supersport") || n.includes("sky sports"))
    )
  })

  if (generalFootballBroadcaster) {
    return {
      channel: generalFootballBroadcaster,
      confidence: 0.50,
      isConfirmedMatch: false,
      isGenericBroadcaster: true,
    }
  }

  return null
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
