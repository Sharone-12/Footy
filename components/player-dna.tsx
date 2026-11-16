import Link from "next/link"
import { cacheLife } from "next/cache"
import { supabase, fetchAllRows } from "@/lib/supabase"
import { scopeLeague, scopeQuery, type Competition } from "@/lib/competition"
import { TeamCrest } from "@/components/player-avatar"
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
async function loadFingerprints(season: string, comp: "league" | "ucl") {
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

/**
 * The fingerprint drawn as a barcode: one bar per stat, up for more than the
 * average outfielder and down for less. Two players who play alike have
 * barcodes that look alike, which is the whole point of drawing it.
 */
function Barcode({ z, height = 56, animate = false }: { z: number[]; height?: number; animate?: boolean }) {
  const half = height / 2
  return (
    <div
      className="flex items-center gap-[2px]"
      style={{ height }}
      role="img"
      aria-label="Style fingerprint"
    >
      {z.map((v, i) => {
        const len = Math.max(2, (Math.abs(v) / 3) * half)
        return (
          <span
            key={DNA_KEYS[i].key}
            title={`${DNA_KEYS[i].label}: ${v > 0 ? "+" : ""}${v.toFixed(1)}σ`}
            className="relative flex-1 min-w-[2px]"
            style={{ height }}
          >
            <span
              className={`absolute inset-x-0 rounded-[1px] ${animate ? "dna-bar" : ""}`}
              style={{
                height: len,
                ...(v >= 0
                  ? { bottom: half, transformOrigin: "bottom" }
                  : { top: half, transformOrigin: "top" }),
                background: v >= 0 ? "var(--pitch)" : "var(--muted-foreground)",
                opacity: v >= 0 ? 0.35 + Math.min(1, v / 2) * 0.65 : 0.45,
                animationDelay: animate ? `${i * 28}ms` : undefined,
              }}
            />
          </span>
        )
      })}
    </div>
  )
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

      <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-6 p-5">
        <div className="min-w-0">
          <div
            className="text-3xl sm:text-4xl font-bold tracking-[-0.03em] leading-none uppercase"
            style={{ fontFamily: "var(--font-condensed)", color: "var(--pitch)" }}
          >
            {primary.name}
          </div>
          <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{primary.blurb}</p>

          <div className="mt-5">
            <Barcode z={me.z} height={72} animate />
            <div className="flex justify-between stat-label mt-1.5">
              <span>attack</span>
              <span>build-up</span>
              <span>defence</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5 mt-4">
            {rest.slice(0, 2).filter((a) => a.fit > 0).map((a) => (
              <span
                key={a.name}
                title={a.blurb}
                className="stat-label rounded-full px-2.5 py-1 border border-border/70"
              >
                also {a.name}
              </span>
            ))}
            {thin && (
              <span className="stat-label rounded-full px-2.5 py-1 border border-border/70">
                thin sample · {Math.round(me.minutes)} min
              </span>
            )}
          </div>
        </div>

        <div className="min-w-0">
          <h3 className="stat-label mb-1.5">Plays like</h3>
          <div className="-mx-2">
            {top.map((m) => (
              <Link
                key={m.slug}
                href={href(m.slug)}
                className="row-item flex items-center gap-3 px-2 py-2 rounded-xl"
              >
                <span className="flex-1 min-w-0">
                  <span className="block text-[0.9rem] font-medium leading-tight truncate">
                    {m.player}
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {m.team_id != null && <TeamCrest teamId={m.team_id} name={m.team} size={14} />}
                    <span className="truncate">{m.team} · {m.role}</span>
                  </span>
                </span>
                <span className="w-20 sm:w-24 shrink-0 hidden min-[400px]:block">
                  <Barcode z={m.z} height={26} />
                </span>
                <span className="stat-figure text-lg w-12 text-right shrink-0">
                  {m.similarity}
                  <span className="text-xs text-muted-foreground">%</span>
                </span>
              </Link>
            ))}
          </div>

          {abroad.length > 0 && (
            <>
              <h3 className="stat-label mt-4 mb-2">Nearest match in other leagues</h3>
              <div className="flex flex-wrap gap-1.5">
                {abroad.map((m) => (
                  <Link
                    key={m.slug}
                    href={href(m.slug)}
                    title={`${m.league} · ${m.similarity}% alike`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border/70 px-2.5 py-1 text-xs hover:bg-muted/50 transition-colors"
                  >
                    {m.team_id != null && <TeamCrest teamId={m.team_id} name={m.team} size={14} />}
                    <span className="truncate max-w-[9rem]">{m.player}</span>
                    <span className="text-muted-foreground tabular-nums">{m.similarity}%</span>
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  )
}
