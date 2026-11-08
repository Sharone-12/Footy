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

export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null }>,
  maxRows = 20_000,
): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; out.length < maxRows; i++) {
    const { data } = await page(i * PAGE_ROWS, i * PAGE_ROWS + PAGE_ROWS - 1)
    if (!data?.length) break
    out.push(...data)
    // A short page is the last one; this is also the guard against a server
    // that ignores the range and would otherwise loop forever.
    if (data.length < PAGE_ROWS) break
  }
  return out
}
