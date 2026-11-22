/**
 * A fetch that always finishes.
 *
 * A plain `fetch` with a `.catch()` still hangs forever if the server accepts
 * the connection and then says nothing: nothing rejects, so the catch never
 * runs, and whatever was waiting on it spins. That is the shape of most of the
 * "stuck loading" on this site, and it bites hardest where it shows most — the
 * live and streaming panels, which talk to third-party providers.
 *
 * This gives every request a deadline and turns any failure — timeout, network
 * error, non-2xx, unparseable body — into `null`. A caller then has one thing
 * to check, and can always leave its loading state.
 */

/** Long enough for a slow upstream, short enough that nobody waits on a dead one. */
export const DEFAULT_TIMEOUT_MS = 8000

export async function fetchJson<T>(
  url: string,
  options: RequestInit & { timeoutMs?: number } = {},
): Promise<T | null> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal, ...rest } = options
  // AbortSignal.any so a caller's own signal (unmount, a newer request) still
  // cancels, with the deadline applying on top rather than replacing it.
  const timeout = AbortSignal.timeout(timeoutMs)
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout

  try {
    const res = await fetch(url, { ...rest, signal: combined })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    // Includes the caller aborting on unmount, which is not worth reporting.
    return null
  }
}
