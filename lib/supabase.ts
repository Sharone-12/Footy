import { createClient } from "@supabase/supabase-js"

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

/**
 * PostgREST caps every response at 1000 rows, server-side and silently —
 * `.limit(2000)` returns 1000 and says nothing. That was invisible while a
 * season held 973 matches; at 1899 it cut /predictions off mid-table, losing
 * Ligue 1 and the Champions League entirely and leaving Bundesliga with a
 * single fixture.
 *
 * Takes a function rather than a query builder on purpose: constraining the
 * generic to supabase-js's own builder type sends TypeScript into
 * "excessively deep" instantiation (same reason `scopeLeague` is loose).
 */
export const PAGE_ROWS = 1000

/**
 * How many pages are asked for at once. One page at a time meant a season of
 * matches cost three or four round trips end to end, on the critical path of
 * every heavy page. Pages do not depend on each other, so a wave goes out
 * together and the requests past the end come back empty and cost little.
 */
const PAGE_BURST = 4

export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null }>,
  maxRows = 20_000,
): Promise<T[]> {
  const out: T[] = []
  for (let wave = 0; out.length < maxRows; wave++) {
    const pages = await Promise.all(
      Array.from({ length: PAGE_BURST }, (_, i) => {
        const from = (wave * PAGE_BURST + i) * PAGE_ROWS
        return page(from, from + PAGE_ROWS - 1)
      }),
    )
    let done = false
    for (const { data } of pages) {
      if (!data?.length) {
        done = true
        break
      }
      out.push(...data)
      // A short page is the last one, and the guard against a server that
      // ignores the range and would otherwise loop forever.
      if (data.length < PAGE_ROWS) {
        done = true
        break
      }
    }
    if (done) break
  }
  return out
}
