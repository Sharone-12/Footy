/**
 * Fan out to every callable provider for one fixture.
 *
 * One failing provider must not touch the others, so every adapter runs
 * inside its own timeout and its own catch, and the results come back through
 * `allSettled`. Everything a caller sees is the normalised shape in types.ts.
 */
import { callable, registry } from "./registry"
import type { DiscoveryResult, Fixture, ProviderResult } from "./types"

const TIMEOUT_MS = Number(process.env.PROVIDER_TIMEOUT_MS) || 15_000
const CACHE_TTL_MS = Number(process.env.PROVIDER_CACHE_TTL_MS) || 60_000

// ponytail: per-instance maps, so two serverless instances can each run a
// discovery for the same fixture. That costs one extra provider call, not
// correctness. Move to a shared store only if the quota bill says so.
const cache = new Map<number, { at: number; result: DiscoveryResult }>()
const inflight = new Map<number, Promise<DiscoveryResult>>()

/** Adapters set this to false on a failure a second attempt cannot fix — a
 *  rejected credential, a spent quota, a rate limit. */
const retryable = (err: unknown) =>
  (err as { retryable?: boolean } | null)?.retryable !== false

/** One attempt, plus one retry — but never after an abort, which means the
 *  timeout fired and a second try would only miss the same deadline, and
 *  never for a failure the adapter has marked permanent. */
async function runProvider(
  entry: ReturnType<typeof registry>[number],
  fixture: Fixture,
): Promise<ProviderResult> {
  const { name } = entry.adapter
  for (let attempt = 1; attempt <= 2; attempt++) {
    const signal = AbortSignal.timeout(TIMEOUT_MS)
    try {
      const events = await entry.adapter.discover(fixture, signal)
      events.sort((a, b) => b.confidence - a.confidence)
      return {
        provider: name,
        availability: events.length ? "available" : "unavailable",
        events,
      }
    } catch (err) {
      const aborted = signal.aborted
      const message = err instanceof Error ? err.message : String(err)
      if (attempt === 2 || aborted || !retryable(err)) {
        // Logged per provider so a recurring failure is attributable.
        console.error(`[providers] ${name} failed for ${fixture.event_id}: ${message}`)
        return {
          provider: name,
          availability: "error",
          events: [],
          error: aborted ? `timed out after ${TIMEOUT_MS}ms` : message,
        }
      }
    }
  }
  // Unreachable: the loop either returns or errors on attempt 2.
  return { provider: name, availability: "error", events: [], error: "unknown" }
}

async function run(fixture: Fixture): Promise<DiscoveryResult> {
  const started = Date.now()
  const entries = registry()
  const active = callable(entries)

  const settled = await Promise.allSettled(active.map((e) => runProvider(e, fixture)))

  const byName = new Map<string, ProviderResult>()
  settled.forEach((s, i) => {
    const name = active[i].adapter.name
    byName.set(
      name,
      s.status === "fulfilled"
        ? s.value
        : { provider: name, availability: "error", events: [], error: "rejected" },
    )
  })

  // Every configured provider appears in the response, callable or not, so the
  // UI can say *why* a provider has nothing rather than omitting it.
  const providers = entries.map(
    (e): ProviderResult =>
      byName.get(e.adapter.name) ?? {
        provider: e.adapter.name,
        availability: !e.supported ? "unsupported" : "unconfigured",
        events: [],
      },
  )

  return { event_id: fixture.event_id, tookMs: Date.now() - started, providers }
}

/**
 * Discover providers for a fixture. Concurrent callers for the same fixture
 * share one run, and a completed run is reused for CACHE_TTL_MS — so the
 * timer's pre-kickoff fetch, a page render and a second tab are one fan-out.
 */
export function discover(fixture: Fixture): Promise<DiscoveryResult> {
  const key = fixture.event_id

  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return Promise.resolve(hit.result)

  const running = inflight.get(key)
  if (running) return running

  const job = run(fixture)
    .then((result) => {
      cache.set(key, { at: Date.now(), result })
      return result
    })
    .finally(() => inflight.delete(key))

  inflight.set(key, job)
  return job
}

/** Highest-confidence embeddable event across providers, if any. */
export function best(result: DiscoveryResult) {
  return result.providers
    .flatMap((p) => p.events)
    .filter((e) => e.embeddable)
    .sort((a, b) => b.confidence - a.confidence)[0]
}
