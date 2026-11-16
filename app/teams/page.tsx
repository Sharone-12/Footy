import { Suspense } from "react"
import { cacheLife } from "next/cache"
import Link from "next/link"
import { supabase } from "@/lib/supabase"
import { Skeleton } from "@/components/ui/skeleton"
import {
  FULL_LEAGUES,
  SINGLE_CLUBS,
  CLUB_CARD_STATS,
  LEAGUE_ABBR,
  LEAGUE_TOURNAMENT_ID,
  POWER_COLORS,
  statValue,
  indexStats,
  fetchTeamData,
  fetchTeamIdMap,
  primaryRows,
  type TeamTableRow,
  type SeasonStatRow,
  type TeamStat,
} from "@/lib/teams"
import { resolveSeason } from "@/lib/seasons"
import { resolveCompetition, inCompetition, scopeQuery, UCL, type Competition } from "@/lib/competition"
import { CompetitionToggle } from "@/components/competition-toggle"
import { LeagueCrest, TeamCrest } from "@/components/player-avatar"
import { TeamRankingsExpand } from "@/components/team-rankings-expand"
import { TableRace } from "@/components/table-race"
import { Reveal } from "@/components/reveal"
import { justiceTable, tableRace, type JusticeRow, type Race } from "@/lib/justice"

const POWER_STAT = { stat: "Expected goals", label: "xG" } as TeamStat

function formBar({ won, drawn, lost, played }: TeamTableRow) {
  if (!played) return []
  return [
    { label: "W", n: won, color: "var(--pitch)" },
    { label: "D", n: drawn, color: "oklch(0.70 0.045 252)" },
    { label: "L", n: lost, color: "oklch(0.55 0.14 25)" },
  ].filter((s) => s.n > 0)
}

function LeagueTable({
  league,
  rows,
  link,
  teamIds,
  justice,
}: {
  league: string
  rows: TeamTableRow[]
  link: (team: string) => string
  teamIds: Map<string, number>
  justice: Map<string, JusticeRow>
}) {
  const topPoints = rows[0]?.points || 1
  return (
    <section className="surface rounded-2xl bg-card overflow-hidden">
      <header className="flex items-baseline justify-between px-5 pt-5 pb-3">
        <h2
          className="text-lg font-semibold tracking-tight uppercase"
          style={{ fontFamily: "var(--font-condensed)" }}
        >
          {league}
        </h2>
        <span className="stat-label">{rows[0]?.played ?? 0} played</span>
      </header>

      <div className="px-2 pb-3">
        <div className="grid grid-cols-[1.25rem_1fr_1.75rem_2.25rem_2.25rem] sm:grid-cols-[1.5rem_1fr_2rem_4.5rem_2.5rem_2.25rem_3.5rem] gap-1.5 sm:gap-2 px-2.5 sm:px-3 pb-2 border-b border-white/5">
          <span className="stat-label text-right">#</span>
          <span className="stat-label">Team</span>
          <span className="stat-label text-right">P</span>
          <span className="stat-label hidden sm:block text-center">W/D/L</span>
          <span className="stat-label text-right">GD</span>
          <span className="stat-label text-right">Pts</span>
          <span
            className="stat-label hidden sm:block text-right"
            title="Expected points: what each match's chances (xG) were worth. The arrow is how many places higher or lower the club would sit on those."
          >
            xPts
          </span>
        </div>

        {rows.map((t, i) => {
          const isBarca = t.team === "FC Barcelona"
          const j = justice.get(`${t.league}|${t.team}`)
          // Positive: the chances say this club should be that many places higher.
          const owed = j ? j.rank - j.xRank : 0
          return (
            <Link
              key={t.team}
              href={link(t.team)}
              className={`group grid grid-cols-[1.25rem_1fr_1.75rem_2.25rem_2.25rem] sm:grid-cols-[1.5rem_1fr_2rem_4.5rem_2.5rem_2.25rem_3.5rem] gap-1.5 sm:gap-2 items-center px-2.5 sm:px-3 py-2 rounded-xl hover:bg-muted/50 transition-colors duration-150 ${
                isBarca ? "barca-stripes text-white" : ""
              }`}
            >
              <span
                className="stat-figure text-sm text-right"
                style={{
                  color: isBarca ? "#ffffff" : i < 4 ? "var(--pitch)" : "var(--muted-foreground)",
                  opacity: i < 4 ? 1 : 0.6,
                }}
              >
                {i + 1}
              </span>

              <span className="min-w-0 flex items-center gap-2">
                {teamIds.get(t.team) != null && (
                  <TeamCrest teamId={teamIds.get(t.team)!} name={t.team} size={20} />
                )}
                <span className="min-w-0">
                  <span className={`block text-[0.9rem] font-medium truncate transition-colors ${
                    isBarca ? "text-white" : "group-hover:text-foreground"
                  }`}>
                    {t.team}
                  </span>
                  <span className="flex h-[3px] gap-px mt-1.5 rounded-full overflow-hidden max-w-[7rem]">
                    {formBar(t).map((s) => (
                      <span
                        key={s.label}
                        style={{ background: s.color, flexGrow: s.n, opacity: 0.75 }}
                      />
                    ))}
                  </span>
                </span>
              </span>

              <span className={`stat-figure text-sm text-right ${isBarca ? "text-white/80" : "text-muted-foreground"}`}>
                {t.played}
              </span>

              <span className={`hidden sm:block stat-figure text-xs text-center tracking-wide ${isBarca ? "text-white/80" : "text-muted-foreground"}`}>
                {t.won}-{t.drawn}-{t.lost}
              </span>

              <span
                className="stat-figure text-sm text-right"
                style={{
                  color:
                    t.goal_diff > 0
                      ? "var(--pitch)"
                      : t.goal_diff < 0
                        ? "oklch(0.65 0.14 25)"
                        : isBarca
                          ? "rgba(255,255,255,0.7)"
                          : "var(--muted-foreground)",
                }}
              >
                {t.goal_diff > 0 ? "+" : ""}
                {t.goal_diff}
              </span>

              <span className="relative text-right">
                <span className={`stat-figure text-lg ${isBarca ? "text-white" : ""}`}>{t.points}</span>
                <span
                  className="absolute -bottom-0.5 right-0 h-[2px] rounded-full"
                  style={{
                    width: `${Math.max(8, (t.points / topPoints) * 100)}%`,
                    background: "var(--pitch)",
                    opacity: 0.3,
                  }}
                />
              </span>

              <span className={`hidden sm:flex items-baseline justify-end gap-1 stat-figure text-xs ${isBarca ? "text-white/80" : "text-muted-foreground"}`}>
                {j ? j.xPoints.toFixed(1) : "—"}
                {owed !== 0 && (
                  <span
                    className="text-[0.6rem]"
                    style={{ color: isBarca ? "#ffffff" : owed > 0 ? "var(--pitch)" : "oklch(0.65 0.14 25)" }}
                  >
                    {owed > 0 ? "▲" : "▼"}
                    {Math.abs(owed)}
                  </span>
                )}
              </span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

function ClubCard({
  short,
  league,
  row,
  stats,
  teamId,
  teamName,
}: {
  short: string
  league: string
  row: TeamTableRow | undefined
  stats: Map<string, SeasonStatRow>
  teamId: number | undefined
  teamName: string
}) {
  const played = row?.played ?? 0
  const perGame = (n: number) => (played ? (n / played).toFixed(1) : "—")
  return (
    <section className="surface rounded-2xl bg-card p-5">
      <header className="flex items-center justify-between pb-3">
        <div className="flex items-center gap-2.5">
          {teamId != null && <TeamCrest teamId={teamId} name={teamName} size={26} />}
          <h3
            className="text-lg font-semibold tracking-tight uppercase"
            style={{ fontFamily: "var(--font-condensed)" }}
          >
            {short}
          </h3>
        </div>
        <span className="stat-label">
          {league} · {played} played
        </span>
      </header>

      {played === 0 ? (
        <p className="stat-label">No finished matches yet this season.</p>
      ) : (
        <>
          <div className="flex gap-4 pb-3">
            <span className="stat-label">
              {row!.won}W {row!.drawn}D {row!.lost}L
            </span>
            <span className="stat-label">
              {row!.goals_for}:{row!.goals_against} (
              {row!.goal_diff > 0 ? "+" : ""}
              {row!.goal_diff})
            </span>
            <span className="stat-label">{row!.points} pts</span>
          </div>
          <div className="grid grid-cols-4 gap-2 border-t border-white/5 pt-3">
            <div>
              <div className="stat-label">Goals/g</div>
              <div className="tabular-nums">{perGame(row!.goals_for)}</div>
            </div>
            {CLUB_CARD_STATS.map((s) => (
              <div key={s.stat}>
                <div className="stat-label">{s.label}</div>
                <div className="tabular-nums">
                  {statValue(stats.get(`${row!.team}|${s.stat}`), s).toFixed(1)}
                  {s.pct ? "%" : ""}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  )
}

type RankedTeam = {
  team: string
  league: string
  score: number
  ppg: number
  gd: number
  gapg: number
  played: number
}

/**
 * Absolute 50–99 rating. Only sustained near-perfect form reaches 99;
 * leader-level teams naturally land in the mid-to-high 90s, not 99 by default.
 */
function displayRating(score: number): number {
  return Math.max(50, Math.min(99, 55 + score * 0.5))
}

function PowerRankings({
  ranked,
  link,
  teamIds,
}: {
  ranked: RankedTeam[]
  link: (team: string) => string
  teamIds: Map<string, number>
}) {
  const top = ranked.slice(0, 5)
  return (
    <section className="surface rounded-2xl bg-card overflow-hidden">
      <header className="px-5 pt-5 pb-4">
        <div className="flex items-center gap-2">
          <h2
            className="text-lg font-semibold tracking-tight uppercase"
            style={{ fontFamily: "var(--font-condensed)" }}
          >
            Power Rankings
          </h2>
          {ranked.length > top.length && (
            <TeamRankingsExpand
              rows={ranked.map((r) => ({
                team: r.team,
                league: r.league,
                href: link(r.team),
                rating: displayRating(r.score).toFixed(1),
                cols: [
                  { value: r.ppg.toFixed(2), label: "ppg" },
                  {
                    value: `${r.gd > 0 ? "+" : ""}${r.gd}`,
                    label: "gd",
                    tone:
                      r.gd > 0
                        ? "var(--pitch)"
                        : r.gd < 0
                          ? "oklch(0.65 0.14 25)"
                          : undefined,
                  },
                  { value: r.gapg.toFixed(2), label: "ga/g" },
                ],
              }))}
              teamIds={teamIds}
            />
          )}
        </div>
        <p className="stat-label mt-1">
          Points per game, goal difference, goals conceded &amp; xG — weighted toward results
        </p>
      </header>

      <div className="px-3 pb-4 space-y-1">
        {top.length === 0 && (
          <p className="stat-label px-4 py-3">
            Needs three matches per club — check back after round 3.
          </p>
        )}
        {top.map((t, i) => {
          const isBarca = t.team === "FC Barcelona"
          return (
            <Link
              key={t.team}
              href={link(t.team)}
              className={`group relative flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-muted/50 transition-colors ${
                isBarca ? "barca-stripes text-white" : ""
              }`}
            >
              <span
                className="stat-figure text-2xl w-8 text-center shrink-0"
                style={{ color: POWER_COLORS[i], fontFamily: "var(--font-condensed)" }}
              >
                {i + 1}
              </span>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {teamIds.get(t.team) != null && (
                    <TeamCrest teamId={teamIds.get(t.team)!} name={t.team} size={22} />
                  )}
                  <span className={`font-semibold text-[0.95rem] truncate transition-colors ${
                    isBarca ? "text-white" : "group-hover:text-foreground"
                  }`}>
                    {t.team}
                  </span>
                  <span className="shrink-0">
                    {LEAGUE_TOURNAMENT_ID[t.league] ? (
                      <LeagueCrest tournamentId={LEAGUE_TOURNAMENT_ID[t.league]} name={t.league} size={20} />
                    ) : (
                      <span className={`stat-label ${isBarca ? "!text-white/80" : ""}`}>{LEAGUE_ABBR[t.league] ?? t.league}</span>
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-1.5">
                  <div
                    className="h-[5px] rounded-full"
                    style={{
                      width: `${(displayRating(t.score) / 99) * 100}%`,
                      background: POWER_COLORS[i],
                      opacity: 0.7,
                      minWidth: "1rem",
                    }}
                  />
                </div>
              </div>

              <div className="flex items-center gap-4 shrink-0">
                <div className="text-right">
                  <div
                    className="stat-figure text-lg"
                    style={{ color: POWER_COLORS[i] }}
                  >
                    {displayRating(t.score).toFixed(1)}
                  </div>
                  <div className={`stat-label ${isBarca ? "!text-white/80" : ""}`}>rating</div>
                </div>
                <div className="text-right hidden sm:block">
                  <div className={`stat-figure text-sm ${isBarca ? "text-white" : ""}`}>{t.ppg.toFixed(2)}</div>
                  <div className={`stat-label ${isBarca ? "!text-white/80" : ""}`}>ppg</div>
                </div>
                <div className="text-right hidden sm:block">
                  <div
                    className="stat-figure text-sm"
                    style={{
                      color:
                        t.gd > 0
                          ? "var(--pitch)"
                          : t.gd < 0
                            ? "oklch(0.65 0.14 25)"
                            : isBarca
                              ? "rgba(255,255,255,0.7)"
                              : "var(--muted-foreground)",
                    }}
                  >
                    {t.gd > 0 ? "+" : ""}{t.gd}
                  </div>
                  <div className={`stat-label ${isBarca ? "!text-white/80" : ""}`}>gd</div>
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

function JusticeBoard({
  rows,
  link,
  teamIds,
}: {
  rows: JusticeRow[]
  link: (team: string) => string
  teamIds: Map<string, number>
}) {
  // A couple of matches of luck is just a couple of matches.
  const pool = rows.filter((r) => r.played >= 5)
  if (pool.length < 10) return null
  const sorted = [...pool].sort((a, b) => b.luck - a.luck)
  const sides = [
    { title: "Running hot", hint: "more points than their chances were worth", rows: sorted.slice(0, 5), tone: "oklch(0.80 0.15 75)" },
    { title: "Owed points", hint: "the chances say they deserve more", rows: sorted.slice(-5).reverse(), tone: "var(--pitch)" },
  ]
  return (
    <section className="surface rounded-2xl bg-card overflow-hidden">
      <header className="px-5 pt-5 pb-3">
        <h2
          className="text-lg font-semibold tracking-tight uppercase"
          style={{ fontFamily: "var(--font-condensed)" }}
        >
          Justice Table
        </h2>
        <p className="stat-label mt-1">
          Real points against expected points — each match re-scored from its xG
        </p>
      </header>
      <div className="grid md:grid-cols-2 gap-x-4 px-3 pb-4">
        {sides.map((side) => (
          <div key={side.title}>
            <div className="px-3 pb-1.5 flex items-baseline justify-between gap-2">
              <span className="stat-label" style={{ color: side.tone }}>{side.title}</span>
              <span className="stat-label truncate">{side.hint}</span>
            </div>
            {side.rows.map((r) => (
              <Link
                key={`${r.league}|${r.team}`}
                href={link(r.team)}
                className="row-item flex items-center gap-3 px-3 py-2 rounded-xl"
              >
                {teamIds.get(r.team) != null && (
                  <TeamCrest teamId={teamIds.get(r.team)!} name={r.team} size={22} />
                )}
                <span className="flex-1 min-w-0">
                  <span className="block text-[0.9rem] font-medium leading-tight truncate">{r.team}</span>
                  <span className="stat-label">
                    {LEAGUE_ABBR[r.league] ?? r.league} · {r.points} pts · {r.xPoints.toFixed(1)} expected
                  </span>
                </span>
                <span className="stat-figure text-xl w-14 text-right" style={{ color: side.tone }}>
                  {r.luck > 0 ? "+" : ""}
                  {r.luck.toFixed(1)}
                </span>
              </Link>
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}

function computePowerRankings(
  table: TeamTableRow[],
  stats: SeasonStatRow[],
): RankedTeam[] {
  const byKey = indexStats(stats)
  const teams = table.filter((t) => t.played >= 3)
  if (teams.length === 0) return []

  // Bayesian shrinkage toward league-average form, so a small sample doesn't
  // let a 2-win-from-2 team top the chart over a proven leader.
  const PRIOR_PPG = 1.3
  const PRIOR_GDPG = 0
  // League-average goals conceded per game across the big five.
  const PRIOR_GAPG = 1.3
  const K = 4

  // Absolute anchors — a team is scored against football norms, not against
  // the rest of this cohort. Each component → 0–100.
  const ppgPts = (ppg: number) =>
    Math.max(0, Math.min(100, (ppg / 3) * 100))         // 3 ppg = 100
  const gdPts = (gdpg: number) =>
    Math.max(0, Math.min(100, ((gdpg + 1) / 4) * 100))  // -1 = 0, +3 = 100
  const xgPts = (xg: number) =>
    Math.max(0, Math.min(100, (xg / 3) * 100))          // 3 xG/g = 100
  const gaPts = (gapg: number) =>
    Math.max(0, Math.min(100, (1 - gapg / 2) * 100))    // clean sheets = 100, 2 conceded/g = 0

  return teams
    .map((t) => {
      const ppgRaw = (t.points + PRIOR_PPG * K) / (t.played + K)
      const gdpgRaw = (t.goal_diff + PRIOR_GDPG * K) / (t.played + K)
      const gapgRaw = (t.goals_against + PRIOR_GAPG * K) / (t.played + K)
      const xg = statValue(byKey.get(`${t.team}|${POWER_STAT.stat}`), POWER_STAT)
      // Goal difference alone let a leaky 3-2 side outrank a 1-0 one at the
      // same margin, so defence is scored on its own as well. Its weight comes
      // out of xG, never out of points: funding it from ppg put 8-point Bayern
      // above 9-point Barcelona in the Champions League on xG alone.
      const score =
        ppgPts(ppgRaw) * 0.55 +
        gdPts(gdpgRaw) * 0.2 +
        gaPts(gapgRaw) * 0.15 +
        xgPts(xg) * 0.1
      return {
        team: t.team,
        league: t.league,
        score,
        ppg: t.points / t.played,
        gd: t.goal_diff,
        gapg: t.goals_against / t.played,
        played: t.played,
      }
    })
    .sort((a, b) => b.score - a.score)
}

const WANTED_STATS = Array.from(
  new Set([
    ...CLUB_CARD_STATS.map((s) => s.stat),
    POWER_STAT.stat,
  ]),
)

/**
 * League tables, club stats and the crest id map for a season.
 *
 * Cached: standings only move when a match finishes, and every visitor was
 * paying for the same two queries.
 */
async function loadTables(season: string, comp: Competition) {
  "use cache"
  cacheLife("minutes")

  const [{ table, stats, xg, matches }, teamIds] = await Promise.all([
    fetchTeamData(supabase, season, WANTED_STATS, comp),
    fetchTeamIdMap(supabase, season),
  ])
  // Derived here rather than per request: both are pure functions of the
  // season's results, and the raw matches never need to leave the cache.
  const justice = justiceTable(matches, xg)
  const races = FULL_LEAGUES.map((lg) => tableRace(matches, lg)).filter(
    (r): r is Race => r !== null,
  )
  return { table, stats, teamIds, justice, races }
}

async function Tables({
  searchParams,
}: {
  searchParams: Promise<{ season?: string; comp?: string }>
}) {
  const sp = await searchParams
  const season = resolveSeason(sp.season)
  const comp: Competition = resolveCompetition(sp.comp)
  const { table: all, stats, teamIds, justice, races } = await loadTables(season, comp)
  const justiceByKey = new Map(justice.map((j) => [`${j.league}|${j.team}`, j]))
  const clubStats = indexStats(stats)
  const ranked = computePowerRankings(primaryRows(all), stats)
  const link = (team: string) => `/teams/compare${scopeQuery(season, comp, { teams: team })}`
  const clubLeague = (league: string) => (comp === "ucl" ? UCL : league)

  return (
    <div className="stagger space-y-5">
      <PowerRankings ranked={ranked} link={link} teamIds={teamIds} />

      {races.length > 0 && <TableRace races={races} teamIds={teamIds} />}

      <JusticeBoard rows={justice} link={link} teamIds={teamIds} />

      <div className="grid lg:grid-cols-2 gap-5">
        {FULL_LEAGUES.filter((lg) => inCompetition(lg, comp)).map((lg) => (
          <LeagueTable
            key={lg}
            league={lg}
            rows={all.filter((t) => t.league === lg)}
            link={link}
            teamIds={teamIds}
            justice={justiceByKey}
          />
        ))}
      </div>

      {SINGLE_CLUBS.length > 0 && (
      <div className="grid lg:grid-cols-2 gap-5">
        {SINGLE_CLUBS.map((c) => (
          <ClubCard
            key={c.team}
            short={c.short}
            league={clubLeague(c.league)}
            row={all.find((t) => t.team === c.team && t.league === clubLeague(c.league))}
            stats={clubStats}
            teamId={teamIds.get(c.team)}
            teamName={c.team}
          />
        ))}
      </div>
      )}
    </div>
  )
}

export default function TeamsPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string; comp?: string }>
}) {
  return (
    <div className="mx-auto max-w-6xl px-3 sm:px-4 py-6 sm:py-14">
      <div className="mb-8 sm:mb-10 animate-fade-in">
        <h1
          className="text-3xl sm:text-5xl lg:text-6xl tracking-[-0.035em] leading-[0.95] mb-3 sm:mb-4"
          style={{ fontFamily: "var(--font-condensed)" }}
        >
          <span className="font-bold">Every club.</span>{" "}
          <span className="font-normal text-muted-foreground">
            Every metric.
          </span>
        </h1>
        <p className="text-muted-foreground text-sm sm:text-base max-w-md mb-5 sm:mb-6 leading-relaxed">
          League standings and per-match team profiles.
        </p>
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
        <Link
          href="/teams/compare"
          className="surface-raised inline-flex items-center gap-2 rounded-full px-4 sm:px-5 py-2 sm:py-2.5 text-xs sm:text-sm font-medium transition-transform duration-200 hover:-translate-y-px"
          style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
        >
          Compare teams
          <span aria-hidden>→</span>
        </Link>
        <Suspense fallback={null}>
          <CompetitionToggle />
        </Suspense>
        </div>
      </div>

      <Reveal
        fallback={
          <div className="grid lg:grid-cols-2 gap-5">
            <Skeleton className="h-[640px] rounded-2xl" />
            <Skeleton className="h-[640px] rounded-2xl" />
          </div>
        }
      >
        <Tables searchParams={searchParams} />
      </Reveal>
    </div>
  )
}
