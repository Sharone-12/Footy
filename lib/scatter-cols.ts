import type { ScatterPlayer } from "@/components/metric-scatter"

/**
 * Every ScatterPlayer field, in the order rows are sent to the browser.
 *
 * In its own module, not in metric-scatter.tsx: that file is a client
 * component, and a value imported from one into a server page arrives as a
 * reference to it rather than the array itself.
 */
export const SCATTER_COLS = [
  "player", "slug", "team", "league", "role", "minutes", "npxg", "xa", "goals",
  "assists", "dribbles", "shots", "key_passes", "big_chances_created", "touches",
  "passes", "final_third_passes", "crosses", "tackles_won", "interceptions",
  "recoveries", "clearances", "aerials_won", "dispossessed",
] as const satisfies readonly (keyof ScatterPlayer)[]
