import { cacheLife } from "next/cache"
import { supabase, fetchAllRows } from "@/lib/supabase"
import { scopeLeague, scopeQuery, type Competition } from "@/lib/competition"
import { DnaPanel } from "@/components/dna-panel"
import {
  DNA_KEYS,
  cohortScale,
  fingerprint,
  similarPlayers,
  archetypes,
  type DnaRow,
  type Fingerprint,
} from "@/lib/dna"

/**
 * Every outfielder's style fingerprint for one season and competition.
 *
 * Cached: it is the same ~1,200 vectors for every player page, and the page
 * itself only needs one of them plus a sort.
 */
export async function loadFingerprints(season: string, comp: "league" | "ucl") {
  "use cache"
  cacheLife("hours")

  const rows = await fetchAllRows<DnaRow>((from, to) =>
    scopeLeague(
      supabase
        .from("players")
        .select(
          "slug, player, team, team_id, league, role, position, minutes, " +
            DNA_KEYS.map((k) => k.key).join(", "),
        )
        .eq("season", season)
        .order("player_id", { ascending: true }),
      comp,
    ).range(from, to) as unknown as PromiseLike<{ data: DnaRow[] | null }>,
  )

  const outfield = rows.filter(
    (r) => r.role !== "Goalkeeper" && r.position !== "Goalkeeper",
  )
  // Same floor the signal boards use: a per-90 rate from a cameo is noise, and
  // noise makes a confident-looking match.
  const most = Math.max(0, ...outfield.map((r) => Number(r.minutes) || 0))
  const pool = outfield.filter((r) => (Number(r.minutes) || 0) >= Math.max(300, most * 0.3))
  const scale = cohortScale(pool)
  return { scale, pool: pool.map((r) => fingerprint(r, scale)) }
}

export async function PlayerDna({
  player,
  season,
  comp,
  shown,
}: {
  player: DnaRow
  season: string
  /** The page's competition, for links. */
  comp: Competition
  /** The competition the numbers come from: a fingerprint needs one pool. */
  shown: "league" | "ucl"
}) {
  const role = String(player.role ?? player.position ?? "")
  if (role === "Goalkeeper") return null

  const { scale, pool } = await loadFingerprints(season, shown)
  if (pool.length < 20) return null

  const me: Fingerprint = fingerprint(player, scale)
  const fits = archetypes(me)
  const [primary, ...rest] = fits
  const matches = similarPlayers(me, pool)
  const top = matches.slice(0, 5)

  // The closest stylistic match in each other league: a replacement shortlist.
  const abroad: typeof matches = []
  for (const m of matches) {
    if (m.league === me.league || abroad.some((a) => a.league === m.league)) continue
    abroad.push(m)
  }

  const thin = !pool.some((p) => p.slug === me.slug)
  const href = (slug: string) => `/player/${slug}${scopeQuery(season, comp)}`

  return (
    <section className="surface rounded-2xl bg-card mb-10 animate-slide-up overflow-hidden">
      <header className="px-5 pt-5 pb-1 flex items-baseline justify-between gap-3">
        <h2 className="stat-label text-sm">Player DNA</h2>
        <span className="stat-label">
          style, not quality · vs {pool.length} outfielders
        </span>
      </header>

      <DnaPanel
        name={me.player}
        z={me.z}
        primary={primary}
        also={rest.slice(0, 2).filter((a) => a.fit > 0)}
        thinMinutes={thin ? Math.round(me.minutes) : null}
        matches={top.map((m) => ({ ...m, href: href(m.slug) }))}
        abroad={abroad.map((m) => ({ ...m, href: href(m.slug) }))}
      />
    </section>
  )
}
