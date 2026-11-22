import { after } from "next/server"
import { supabase } from "@/lib/supabase"
import { supabaseAdmin } from "@/lib/supabase-admin"
import { hasKickedOff } from "@/lib/live"
import type { MatchPrediction } from "@/lib/predictions"

type FrozenRow = {
  event_id: number
  predicted: "home" | "draw" | "away"
  home_win: number
  draw: number
  away_win: number
}

async function fetchFrozen(eventIds: number[]): Promise<Map<number, FrozenRow>> {
  const out = new Map<number, FrozenRow>()
  if (eventIds.length === 0) return out

  // A season is several chunks, and they were awaited one after another: four
  // round trips end to end for queries that do not depend on each other.
  const chunks: number[][] = []
  for (let i = 0; i < eventIds.length; i += 500) chunks.push(eventIds.slice(i, i + 500))

  const results = await Promise.all(
    chunks.map((chunk) =>
      supabase
        .from("predictions")
        .select("event_id, predicted, home_win, draw, away_win")
        .in("event_id", chunk),
    ),
  )
  for (const { data } of results) {
    for (const row of (data ?? []) as FrozenRow[]) out.set(row.event_id, row)
  }
  return out
}

export type PredictionWithFreeze = MatchPrediction & { frozen: boolean }

/**
 * Has the match kicked off? Once it has, its prediction is the receipt and
 * never moves again. A result settles it whatever the clock says; otherwise
 * the kickoff instant decides, end of day for a fixture with no time yet.
 */
export const hasStarted = (
  p: Pick<MatchPrediction, "actual" | "kickoff" | "date">,
  now: number = Date.now(),
) => p.actual !== null || hasKickedOff({ kickoff: p.kickoff ?? null, date: p.date }, now)

const differs = (f: FrozenRow, p: MatchPrediction) =>
  f.home_win !== p.homeWin ||
  f.draw !== p.draw ||
  f.away_win !== p.awayWin ||
  f.predicted !== p.predicted

/**
 * Hold every prediction at kickoff, and let it move freely until then.
 *
 * A match that has not started shows what the model says now, and its stored
 * row is refreshed to match, so anything the model has learnt since reaches
 * the fixture. At kickoff the row stops being rewritten and becomes what the
 * page shows forever after — the receipt, free of hindsight.
 *
 * It used to freeze on the first view instead, which could be months out;
 * everything learnt in between then never reached that match.
 *
 * Settled matches with no stored row carry frozen:false, and the UI keeps
 * them out of the accuracy tracker: there is no honest kickoff record.
 */
export async function withFrozenPredictions(
  computed: MatchPrediction[],
): Promise<PredictionWithFreeze[]> {
  const frozen = await fetchFrozen(computed.map((p) => p.event_id))
  const now = Date.now()

  // Only what is still to come, and only where the number actually moved: in
  // the steady state this is empty, and after a refit it writes once.
  const toFreeze = computed
    .filter((p) => {
      if (hasStarted(p, now)) return false
      const f = frozen.get(p.event_id)
      return !f || differs(f, p)
    })
    .map((p) => ({
      event_id: p.event_id,
      predicted: p.predicted,
      home_win: p.homeWin,
      draw: p.draw,
      away_win: p.awayWin,
    }))

  if (toFreeze.length > 0) {
    after(async () => {
      await supabaseAdmin.from("predictions").upsert(toFreeze, { onConflict: "event_id" })
    })
  }

  return computed.map((p) => {
    const f = frozen.get(p.event_id)
    // Before kickoff the live model wins, even against a stored row.
    if (f && hasStarted(p, now)) {
      return {
        ...p,
        predicted: f.predicted,
        homeWin: f.home_win,
        draw: f.draw,
        awayWin: f.away_win,
        correct: p.actual ? f.predicted === p.actual : null,
        frozen: true,
      }
    }
    return { ...p, frozen: false }
  })
}
