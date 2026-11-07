import { Suspense } from "react"
import { cacheLife } from "next/cache"
import Link from "next/link"
import { supabase } from "@/lib/supabase"
import { resolveSeason } from "@/lib/seasons"
import { ROLE_OVERRIDES } from "@/lib/squad"
import { BARCA_ID } from "@/lib/teams"
import { rankPlayers, ROLE_PROFILES, type Row as RankRow } from "@/lib/rank"
import {
  ROLE_SPECS,
  MIN_MINUTES,
  topMetrics,
  num,
  combineCompetitions,
  rank,
  cell,
  type ProfileMetric,
  type Ranked,
} from "@/lib/leaders"
import { PlayerAvatar, TeamCrest } from "@/components/player-avatar"
import { BarcaNav } from "@/components/barca-nav"
import { Skeleton } from "@/components/ui/skeleton"

const BARCA = "FC Barcelona"

/** Every column a board might display: the profile metrics, the season
 *  totals shown instead of rates, and the keeper fallback's own columns. */
const SQUAD_COLS = Array.from(
  new Set([
    "player_id", "slug", "player", "role", "league", "minutes",
    "goals", "assists", "errors_to_goal",
    ...Object.values(ROLE_PROFILES).flatMap((prof) => prof.map((w) => w.key)),
  ]),
).join(", ")

/** Supporting columns appear one breakpoint at a time, widest last. */
const COL_AT = ["sm:table-cell", "md:table-cell", "lg:table-cell", "xl:table-cell"]

type BoardRow = {
  playerId: number | null
  player: string
  slug: string
  headline: string
  cells: string[]
}

type Board = {
  title: string
  note?: string
  headlineLabel: string
  columnLabels: string[]
  rows: BoardRow[]
}

function RoleBoard({ board }: { board: Board }) {
  if (board.rows.length === 0) return null

  return (
    <section className="surface bg-card rounded-2xl overflow-hidden">
      <header className="px-4 pt-4 pb-2">
        <h2
          className="text-lg font-semibold tracking-tight uppercase"
          style={{ fontFamily: "var(--font-condensed)" }}
        >
          {board.title}
        </h2>
        {board.note && <p className="text-muted-foreground text-xs mt-1">{board.note}</p>}
      </header>
      {/* Scrolls in its own box rather than being cut off by the card's
          corner clipping — and the px-4 keeps every row rule clear of the
          rounded corners, which edge-to-edge borders collide with. */}
      <div className="overflow-x-auto px-4 pb-2">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-border">
              <th className="stat-label text-[0.6rem] font-normal pr-2 py-2 w-full">Player</th>
              <th className="stat-label text-[0.6rem] font-normal px-2 py-2 text-right whitespace-nowrap">
                {board.headlineLabel}
              </th>
              {board.columnLabels.map((label, i) => (
                <th
                  key={label}
                  className={`stat-label text-[0.6rem] font-normal px-2 py-2 text-right whitespace-nowrap hidden ${COL_AT[i] ?? "sm:table-cell"}`}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {board.rows.map((p, i) => (
              <tr key={p.slug} className="border-b border-border last:border-0">
                <td className="pr-2 py-2.5 w-full">
                  <Link
                    href={`/player/${p.slug}`}
                    className="flex items-center gap-2.5 min-w-0 hover:text-foreground"
                  >
                    <span className="stat-label text-[0.6rem] w-3 shrink-0">{i + 1}</span>
                    {p.playerId != null && (
                      <PlayerAvatar playerId={p.playerId} name={p.player} size={26} />
                    )}
                    <span className="truncate font-semibold text-[0.9rem]">{p.player}</span>
                  </Link>
                </td>
                <td
                  className="stat-figure px-2 py-2.5 text-right text-[0.9rem]"
                  style={{ color: "var(--pitch)" }}
                >
                  {p.headline}
                </td>
                {p.cells.map((v, j) => (
                  <td
                    key={board.columnLabels[j]}
                    className={`stat-figure px-2 py-2.5 text-right text-[0.85rem] text-muted-foreground hidden ${COL_AT[j] ?? "sm:table-cell"}`}
                  >
                    {v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

const pct = (n: number | undefined) => (n == null ? "—" : String(Math.round(n)))

/**
 * Season boards for one season.
 *
 * Cached: every role board queries every player in that role league-wide, so
 * an uncached visit cost seconds of Supabase round trips for numbers that
 * only move when a match finishes.
 */
async function loadBoards(season: string): Promise<Board[] | null> {
  "use cache"
  cacheLife("minutes")

  // `Scored` carries a slug but no id, and the avatar needs the id.
  const { data: squadRows } = await supabase
    .from("players")
    .select(SQUAD_COLS)
    .eq("team", BARCA)
    .eq("season", season)

  // Every competition counts, so a player's rows are summed rather than one
  // being picked: 15 league goals and 4 in Europe is a 19-goal season.
  const squad = combineCompetitions((squadRows || []) as unknown as Ranked[])
  const rowBySlug = new Map(squad.map((r) => [r.slug, r]))

  if (squad.length === 0) return null

  // Players whose ranking role is overridden are fetched once and spliced
  // into the cohort they actually belong to; the per-role query cannot find
  // them because it filters on the role the database holds.
  const { data: overrideRows } = await supabase
    .from("players")
    .select("*")
    .in("slug", Object.keys(ROLE_OVERRIDES))
    .eq("season", season)
  const overrides = combineCompetitions((overrideRows ?? []) as RankRow[])

  const boards = await Promise.all(
    ROLE_SPECS.map(async (spec): Promise<Board> => {
      const profile = ROLE_PROFILES[spec.role]

      // No profile means the shared ranker has nothing to score this role on
      // — Goalkeeper. Fall back to the spec's own columns rather than fake a
      // rating out of metrics that don't measure keeping.
      if (!profile) {
        return {
          title: spec.label,
          note: spec.note,
          headlineLabel: spec.headline.label,
          columnLabels: spec.columns.map((c) => c.label),
          rows: rank(squad, spec).map((p) => ({
            playerId: p.player_id,
            player: p.player,
            slug: p.slug,
            headline: cell(p[spec.headline.col], spec.headline),
            cells: spec.columns.map((c) => cell(p[c.col], c)),
          })),
        }
      }

      // Percentiles need a real peer group, so the cohort is every player in
      // this role league-wide, not the handful of teammates. Rows are folded
      // per player first — otherwise the same person appears once per
      // competition and the pool is partly duplicates.
      const { data } = await supabase
        .from("players")
        .select("*")
        .eq("role", spec.role)
        .eq("season", season)
      const queried = combineCompetitions((data ?? []) as RankRow[])
      const cohort = [
        // Drop anyone overridden out of this role...
        ...queried.filter((r) => {
          const to = ROLE_OVERRIDES[String(r.slug)]
          return to == null || to === spec.role
        }),
        // ...and pull in anyone overridden into it.
        ...overrides.filter(
          (r) =>
            ROLE_OVERRIDES[String(r.slug)] === spec.role && String(r.role) !== spec.role,
        ),
      ]
      const scored = rankPlayers(cohort, spec.role).filter((s) => s.team === BARCA)
      const metrics: ProfileMetric[] = topMetrics(profile)

      return {
        title: spec.label,
        note: `Weighted percentile across ${profile.length} metrics, against every player in this role, all competitions combined, adjusted for minutes played.`,
        headlineLabel: "Score",
        columnLabels: metrics.map((m) => m.label),
        rows: scored.map((s) => {
          // Percentiles rank; the columns show what actually happened, read
          // straight off the player's row. "Goals 100" told you nothing.
          const row = rowBySlug.get(s.slug)
          return {
            playerId: row?.player_id ?? null,
            player: s.player,
            slug: s.slug,
            headline: pct(s.score),
            cells: metrics.map((m) => {
              const v = row ? num(row[m.source]) : null
              return v == null ? "\u2014" : v.toFixed(m.digits)
            }),
          }
        }),
      }
    }),
  )

  return boards
}

async function Leaders({
  searchParams,
}: {
  searchParams: Promise<{ season?: string }>
}) {
  const season = resolveSeason((await searchParams).season)
  const boards = await loadBoards(season)

  if (!boards) {
    return <p className="text-muted-foreground">No squad data for {season}.</p>
  }

  return (
    <>
      <p className="stat-label text-[0.65rem] mb-4">
        {season} · all competitions · score is a 0&ndash;100 percentile, columns are real
        totals and per-90 rates · keeper board needs {MIN_MINUTES} minutes
      </p>
      <div className="flex flex-col gap-4 stagger">
        {boards.map((b) => (
          <RoleBoard key={b.title} board={b} />
        ))}
      </div>
    </>
  )
}

export default function BarcaLeadersPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string }>
}) {
  return (
    <div className="mx-auto max-w-6xl px-3 sm:px-4 py-6 sm:py-14">
      <div className="mb-6 flex items-center gap-3 animate-fade-in">
        <TeamCrest teamId={BARCA_ID} name={BARCA} size={36} className="shrink-0" />
        <div>
          <h1
            className="text-3xl sm:text-5xl font-bold tracking-[-0.035em] leading-none"
            style={{ fontFamily: "var(--font-condensed)" }}
          >
            LEADERS
          </h1>
          <p className="text-muted-foreground text-xs sm:text-sm mt-1 leading-snug">
            Who leads the squad in each role, on the stats that role is judged on.
          </p>
        </div>
      </div>
      <div className="mb-6">
        <Suspense fallback={<Skeleton className="h-10 w-72 rounded-full" />}>
          <BarcaNav />
        </Suspense>
      </div>
      <Suspense
        fallback={
          <div className="flex flex-col gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-48 rounded-2xl" />
            ))}
          </div>
        }
      >
        <Leaders searchParams={searchParams} />
      </Suspense>
    </div>
  )
}
