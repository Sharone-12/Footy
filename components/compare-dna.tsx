import { supabase } from "@/lib/supabase"
import { resolveSeason } from "@/lib/seasons"
import { resolveCompetition, scopeLeague } from "@/lib/competition"
import { DNA_KEYS, fingerprint, archetypes, cosine, type DnaRow } from "@/lib/dna"
import { loadFingerprints } from "@/components/player-dna"
import { Barcode } from "@/components/dna-barcode"

/**
 * The first two compared players' styles, one above the centre line and one
 * mirrored below it. Where the two halves are symmetrical they play alike;
 * where one side sticks out, that is the difference.
 */
export async function CompareDna({
  searchParams,
}: {
  searchParams: Promise<{ players?: string; season?: string; comp?: string }>
}) {
  const sp = await searchParams
  const slugs = (sp.players ?? "").split(",").filter(Boolean).slice(0, 2)
  if (slugs.length < 2) return null

  const season = resolveSeason(sp.season)
  const shown = resolveCompetition(sp.comp) === "ucl" ? "ucl" : "league"
  const [{ scale, pool }, { data }] = await Promise.all([
    loadFingerprints(season, shown),
    scopeLeague(
      supabase
        .from("players")
        .select(
          "slug, player, team, team_id, league, role, position, minutes, " +
            DNA_KEYS.map((k) => k.key).join(", "),
        )
        .in("slug", slugs)
        .eq("season", season)
        .order("minutes", { ascending: false }),
      shown,
    ),
  ])
  if (pool.length < 20) return null

  const rows = (data ?? []) as unknown as DnaRow[]
  const pair = slugs
    .map((slug) => rows.find((r) => r.slug === slug))
    .filter((r): r is DnaRow => !!r && r.role !== "Goalkeeper" && r.position !== "Goalkeeper")
    .map((r) => fingerprint(r, scale))
  if (pair.length < 2) return null

  const [a, b] = pair
  const alike = Math.round(Math.max(0, cosine(a.z, b.z)) * 100)

  return (
    <div className="mx-auto max-w-6xl px-3 sm:px-4 pb-12">
      <section className="surface rounded-2xl bg-card p-5">
        <header className="flex items-baseline justify-between gap-3 pb-4">
          <h2 className="stat-label text-sm">Style match</h2>
          <span className="stat-label">style, not quality · mirrored where they play alike</span>
        </header>
        <div className="grid sm:grid-cols-[9rem_minmax(0,1fr)_5rem] items-center gap-x-5 gap-y-2">
          <div className="min-w-0">
            <div className="text-[0.95rem] font-semibold truncate">{a.player}</div>
            <div className="stat-label" style={{ color: "var(--pitch)" }}>{archetypes(a)[0].name}</div>
          </div>
          <Barcode z={a.z} height={56} animate />
          <div className="row-span-2 text-right">
            <div className="stat-figure text-4xl" style={{ color: "var(--pitch)" }}>
              {alike}
              <span className="text-lg text-muted-foreground">%</span>
            </div>
            <div className="stat-label">alike</div>
          </div>
          <div className="min-w-0">
            <div className="text-[0.95rem] font-semibold truncate">{b.player}</div>
            <div className="stat-label" style={{ color: "var(--pitch)" }}>{archetypes(b)[0].name}</div>
          </div>
          <Barcode z={b.z} height={56} animate flip />
        </div>
        <div className="flex justify-between stat-label mt-3 sm:pl-[10.25rem] sm:pr-[6.25rem]">
          <span>attack</span>
          <span>build-up</span>
          <span>defence</span>
        </div>
      </section>
    </div>
  )
}
