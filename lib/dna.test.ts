/** Self-check for player DNA: `node lib/dna.test.ts` */
import assert from "node:assert/strict"
import { DNA_KEYS, cohortScale, fingerprint, similarPlayers, archetypes, cosine } from "./dna.ts"

const base = Object.fromEntries(DNA_KEYS.map(({ key }) => [key, 1]))
const row = (slug: string, over: Record<string, number>) => ({ slug, player: slug, ...base, ...over })

const rows = [
  row("poacher", { goals_p90: 5, xg_p90: 5, shots_on_target_p90: 5, touches_p90: 0, passes_p90: 0 }),
  row("poacher-quiet", { goals_p90: 3, xg_p90: 3, shots_on_target_p90: 3, touches_p90: 0.5, passes_p90: 0.5 }),
  row("stopper", { clearances_p90: 6, blocked_shots_p90: 5, aerials_won_p90: 5 }),
  row("creator", { key_passes_p90: 5, xa_p90: 5, big_chances_created_p90: 5 }),
  row("average", {}),
]
const scale = cohortScale(rows)
const fps = rows.map((r) => fingerprint(r, scale))
const by = (slug: string) => fps.find((f) => f.slug === slug)!

// Same shape at lower volume still matches best: similarity is direction, not size.
const like = similarPlayers(by("poacher"), fps)
assert.equal(like[0].slug, "poacher-quiet")
assert.ok(!like.some((m) => m.slug === "poacher"), "never matches itself")
assert.ok(like[0].similarity > like.at(-1)!.similarity)
assert.ok(like.every((m) => m.similarity >= 0 && m.similarity <= 100))

assert.equal(archetypes(by("poacher"))[0].name, "Poacher")
assert.equal(archetypes(by("stopper"))[0].name, "Stopper")
assert.equal(archetypes(by("creator"))[0].name, "Creator")

// Degenerate inputs don't divide by zero.
assert.equal(cosine([0, 0], [1, 1]), 0)
assert.ok(cohortScale([]).sd.every((s) => s === 1))

console.log("dna ok")
