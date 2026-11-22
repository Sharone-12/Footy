import { DEFAULT_PARAMS, COIN_FLIP_LOSS, type Params, type Score } from "@/lib/learn"
import fitted from "@/lib/model-params.json"

/**
 * The model's parameters, learnt from results rather than chosen by hand.
 *
 * Read straight from lib/model-params.json, which `node scripts/fit-model.mjs`
 * writes beside the twice-daily refresh. Nothing is queried or fitted here.
 *
 * It used to fit on demand, inside the request: two seasons of matches and
 * per-match stats read back, then two coordinate-descent fits, about six
 * seconds a visitor paid whenever the cache was cold. The result depends only
 * on finished matches, so it is identical for everyone until results change,
 * and recomputing it per request was waste.
 *
 * `tested` is the honest mark: parameters fitted on the previous season only,
 * scored on this one, against the hand-set model over the same matches. The
 * shipped `params` are fitted on everything finished, because an upcoming
 * match is unseen either way.
 */

export type ModelFit = {
  params: Params
  /** Matches the shipped fit learnt from. */
  trained: number
  /** Seasons those matches came from, newest first. */
  seasons: string[]
  /**
   * Out-of-sample mark, or null when there was no earlier season to train on.
   * Both scores cover exactly the same matches.
   */
  tested: { season: string; learnt: Score; handSet: Score } | null
}

export const COIN_FLIP = COIN_FLIP_LOSS

/** How much of the gap from a coin flip to certainty a log-loss closes, 0-100. */
export const skillOf = (logLoss: number) =>
  Math.round((1 - logLoss / COIN_FLIP_LOSS) * 1000) / 10

const STORED = fitted as unknown as ModelFit & { season: string }

/**
 * Async only so the call sites did not have to change when the fitting moved
 * offline. It does no work and never blocks.
 */
export async function loadModelFit(season: string): Promise<ModelFit> {
  // A season the file was not fitted for falls back to the hand-set model,
  // rather than applying another season's settings to it.
  if (STORED.season !== season || STORED.trained === 0) {
    return { params: DEFAULT_PARAMS, trained: 0, seasons: [season], tested: null }
  }
  return {
    params: STORED.params,
    trained: STORED.trained,
    seasons: STORED.seasons,
    tested: STORED.tested,
  }
}
