import Link from "next/link"
import { cacheLife } from "next/cache"
import { supabase } from "@/lib/supabase"
import { resolveSeason } from "@/lib/seasons"
import { BARCA_ID, LEAGUE_ABBR, fetchTeamData, fetchTeamIdMap, parseRaw } from "@/lib/teams"
import { tableRace, xPointsRace } from "@/lib/justice"
import { seasonScarf, playedLikeUs, pointsGap, leagueRanks, type Trait } from "@/lib/barca"
import { DNA_KEYS, fingerprint, archetypes, type DnaRow } from "@/lib/dna"
import { clubColor } from "@/lib/club-colors"
import { formatDateIST } from "@/lib/time"
import { loadFingerprints } from "@/components/player-dna"
import { TeamCrest } from "@/components/player-avatar"
import { SeasonWave } from "@/components/season-wave"
import { PlayerTitle } from "@/components/player-title"
import { playerTitleName } from "@/lib/view-transition"
import { TitleRaceChart } from "@/components/title-race-chart"

const BARCA = "FC Barcelona"
const HOME_LEAGUE = "La Liga"

/** What "playing like Barça" is measured on: the ball, where it goes, what it creates. */
const STYLE_STATS = [
  "Ball possession",
  "Accurate passes",
  "Final third entries",
  "Big chances",
  "Expected goals",
]

const RIVAL_FALLBACK = ["#E8E8E8", "#60a5fa", "#fbbf24"]

const fix1 = (v: number) => v.toFixed(1)
const OPPONENT_SPEC = [
  { key: "ppg", label: "Points per game", better: "high" as const, fmt: (v: number) => v.toFixed(2) },
  { key: "gf", label: "Goals scored", better: "high" as const, fmt: fix1 },
  { key: "xg", label: "Chances created (xG)", better: "high" as const, fmt: fix1 },
  { key: "ga", label: "Goals conceded", better: "low" as const, fmt: fix1 },
  { key: "xga", label: "Chances allowed (xG)", better: "low" as const, fmt: fix1 },
  { key: "poss", label: "Possession", better: "high" as const, fmt: (v: number) => `${Math.round(v)}%` },
]

/**
 * Everything the Barça season section shows, derived once.
 *
 * Cached for hours: it is a pure function of results and match stats, which
 * only move when the twice-daily refresh lands.
 */
async function loadBarcaSeason(season: string) {
  "use cache"
  cacheLife("hours")

  const today = new Date().toISOString().slice(0, 10)
  const [{ table, stats, xg, matches }, teamIds, upcoming] = await Promise.all([
    fetchTeamData(supabase, season, STYLE_STATS),
    fetchTeamIdMap(supabase, season),
    supabase
      .from("matches")
      .select("event_id, date, kickoff, league, home, home_id, away, away_id")
      .eq("season", season)
      .eq("status", "upcoming")
      .gte("date", today)
      .or(`home_id.eq.${BARCA_ID},away_id.eq.${BARCA_ID}`)
      .order("date", { ascending: true })
      .limit(1),
  ])

  // ── The scarf, and how Barça-like each night was ──
  const stripes = seasonScarf(matches, BARCA)
  const { data: raw } = stripes.length
    ? await supabase
        .from("match_stats")
        .select("event_id, stat, home, away")
        .in("event_id", stripes.map((s) => s.event_id))
        .in("stat", STYLE_STATS)
        .limit(1000)
    : { data: [] }
  const homeAt = new Map(stripes.map((s) => [s.event_id, s.home]))
  const perMatch = new Map<number, Record<string, number>>()
  for (const r of (raw ?? []) as { event_id: number; stat: string; home: string; away: string }[]) {
    const { value, pct } = parseRaw(homeAt.get(r.event_id) ? r.home : r.away)
    const v = r.stat === "Ball possession" ? pct : value
    if (v == null) continue
    const row = perMatch.get(r.event_id) ?? {}
    row[r.stat] = v
    perMatch.set(r.event_id, row)
  }
  const like = playedLikeUs(perMatch, STYLE_STATS)
  const scarf = stripes.map((s) => ({ ...s, like: like.get(s.event_id) ?? null }))

  // ── The title race ──
  const race = tableRace(matches, HOME_LEAGUE)
  const liga = table.filter((t) => t.league === HOME_LEAGUE && t.team !== BARCA)
  const rivalNames = [...new Set(["Real Madrid", ...liga.map((t) => t.team)])]
    .filter((t) => liga.some((r) => r.team === t))
    .slice(0, 3)
  const gap = race ? pointsGap(race, xPointsRace(matches, xg, race), BARCA, rivalNames) : null
  const title = gap && {
    rows: gap.rounds.map((round, i) => ({
      round,
      deserved: gap.deserved[i],
      ...Object.fromEntries(gap.rivals.map((r) => [r.team, r.gap[i]])),
    })),
    rivals: gap.rivals.map((r, i) => ({
      team: r.team,
      color: clubColor(r.team) ?? RIVAL_FALLBACK[i % RIVAL_FALLBACK.length],
    })),
    now: gap.rivals[0].gap.at(-1) ?? 0,
    deserved: gap.deserved.at(-1) ?? 0,
  }

  // ── Next opponent ──
  const fixture = (upcoming.data?.[0] ?? null) as {
    event_id: number; date: string; kickoff: string | null; league: string
    home: string; home_id: number | null; away: string; away_id: number | null
  } | null
  let next = null
  if (fixture) {
    const atHome = fixture.home_id === BARCA_ID
    const opponent = atHome ? fixture.away : fixture.home
    const opponentId = atHome ? fixture.away_id : fixture.home_id
    // Judged in the competition the match is in when they have a record
    // there; otherwise their domestic league.
    const row =
      table.find((t) => t.team === opponent && t.league === fixture.league) ??
      table.find((t) => t.team === opponent)
    let traits: Trait[] = []
    if (row && row.played >= 3) {
      const peers = table.filter((t) => t.league === row.league && t.played > 0)
      const xgFor = new Map<string, number>()
      const xgAgainst = new Map<string, number>()
      const xgGames = new Map<string, number>()
      for (const m of matches) {
        const x = xg.get(m.event_id)
        if (!x || m.league !== row.league) continue
        for (const [team, f, a] of [[m.home, x[0], x[1]], [m.away, x[1], x[0]]] as const) {
          xgFor.set(team, (xgFor.get(team) ?? 0) + f)
          xgAgainst.set(team, (xgAgainst.get(team) ?? 0) + a)
          xgGames.set(team, (xgGames.get(team) ?? 0) + 1)
        }
      }
      const poss = new Map(
        stats.filter((s) => s.stat === "Ball possession").map((s) => [s.team, Number(s.pct)]),
      )
      traits = leagueRanks(
        opponent,
        peers.map((t) => {
          const g = xgGames.get(t.team) ?? 0
          return {
            team: t.team,
            metrics: {
              ppg: t.points / t.played,
              gf: t.goals_for / t.played,
              ga: t.goals_against / t.played,
              xg: g ? (xgFor.get(t.team) ?? 0) / g : NaN,
              xga: g ? (xgAgainst.get(t.team) ?? 0) / g : NaN,
              poss: poss.get(t.team) ?? NaN,
            },
          }
        }),
        OPPONENT_SPEC,
      )
    }

    // Main threat: whoever has had a hand in the most goals.
    let threat = null
    if (opponentId != null) {
      const [{ data: squad }, { scale }] = await Promise.all([
        supabase
          .from("players")
          .select(
            "slug, player, team, team_id, league, role, position, minutes, goals, assists, " +
              DNA_KEYS.map((k) => k.key).join(", "),
          )
          .eq("team_id", opponentId)
          .eq("season", season),
        loadFingerprints(season, "league"),
      ])
      const rows = ((squad ?? []) as unknown as DnaRow[]).filter((r) => r.position !== "Goalkeeper")
      const hand = (r: DnaRow) => (Number(r.goals) || 0) + (Number(r.assists) || 0)
      const best = rows.sort((a, b) => hand(b) - hand(a) || Number(b.minutes) - Number(a.minutes))[0]
      if (best && hand(best) > 0) {
        threat = {
          slug: String(best.slug),
          player: String(best.player),
          goals: Number(best.goals) || 0,
          assists: Number(best.assists) || 0,
          archetype: archetypes(fingerprint(best, scale))[0].name,
        }
      }
    }

    const { data: frozen } = await supabase
      .from("predictions")
      .select("home_win, draw, away_win")
      .eq("event_id", fixture.event_id)
      .limit(1)
    const f = frozen?.[0] as { home_win: number; draw: number; away_win: number } | undefined

    next = {
      event_id: fixture.event_id,
      date: fixture.date,
      kickoff: fixture.kickoff,
      league: fixture.league,
      atHome,
      opponent,
      opponentId,
      record: row ? `${row.won}W ${row.drawn}D ${row.lost}L · ${LEAGUE_ABBR[row.league] ?? row.league}` : null,
      form: seasonScarf(matches, opponent).slice(-5).map((s) => s.result),
      traits,
      threat,
      odds: f
        ? { win: atHome ? f.home_win : f.away_win, draw: f.draw, lose: atHome ? f.away_win : f.home_win }
        : null,
    }
  }

  return { scarf, title, next, opponentCrest: next?.opponentId ?? teamIds.get(next?.opponent ?? "") ?? null }
}

const BLAU = "#1B3F8F"
const GRANA = "#A50044"
const GOLD = "#EDBB00"

function Heading({ children, note }: { children: string; note?: string }) {
  return (
    <header className="flex items-baseline justify-between gap-3 pb-3">
      <h2
        className="text-lg font-semibold tracking-tight uppercase"
        style={{ fontFamily: "var(--font-condensed)" }}
      >
        {children}
      </h2>
      {note && <span className="stat-label truncate">{note}</span>}
    </header>
  )
}

export async function BarcaSeason({
  searchParams,
}: {
  searchParams: Promise<{ season?: string }>
}) {
  const season = resolveSeason((await searchParams).season)
  const { scarf, title, next, opponentCrest } = await loadBarcaSeason(season)
  if (scarf.length === 0) return null

  const won = scarf.filter((s) => s.result === "W").length
  const drawn = scarf.filter((s) => s.result === "D").length
  const scored = scarf.filter((s) => s.like != null)
  const most = scored.length ? scored.reduce((a, b) => (b.like! > a.like! ? b : a)) : null
  const least = scored.length ? scored.reduce((a, b) => (b.like! < a.like! ? b : a)) : null
  // Wins alternate blau and grana so a winning run reads as the shirt.
  let wins = 0
  const colors = scarf.map((s) =>
    s.result === "W" ? (wins++ % 2 === 0 ? BLAU : GRANA) : s.result === "D" ? "oklch(0.58 0 0)" : "oklch(0.16 0 0)",
  )

  return (
    <div className="space-y-5 mb-8">
      <section className="surface rounded-2xl bg-card p-5">
        <Heading note={`${won}W ${drawn}D ${scarf.length - won - drawn}L · every competition`}>
          Season scarf
        </Heading>

        {/* One stripe a match, oldest on the left: blaugrana for a win, grey
            for a draw, black for a defeat. */}
        <div className="scarf flex h-12 rounded-[3px] overflow-hidden">
          {scarf.map((s, i) => {
            const color = colors[i]
            return (
              <Link
                key={s.event_id}
                href={`/predictions/match?id=${s.event_id}`}
                title={`${s.result} ${s.gf}–${s.ga} ${s.home ? "v" : "at"} ${s.opponent} · ${LEAGUE_ABBR[s.league] ?? s.league}`}
                aria-label={`${s.result} ${s.gf}–${s.ga} ${s.home ? "v" : "at"} ${s.opponent}`}
                className="scarf-stripe flex-1 min-w-[3px] hover:brightness-150 transition-[filter]"
                style={{ background: color, animationDelay: `${i * 45}ms` }}
              />
            )
          })}
        </div>

        {scored.length > 0 && (
          <>
            <div className="flex items-end h-10 mt-2" aria-hidden>
              {scarf.map((s, i) => (
                <span key={s.event_id} className="flex-1 min-w-[3px] px-px h-full flex items-end">
                  {s.like != null && (
                    <span
                      title={`${s.like}/100 v ${s.opponent}`}
                      className="bar-rise block w-full rounded-t-[2px]"
                      style={{
                        height: `${Math.max(6, s.like)}%`,
                        background: GOLD,
                        opacity: 0.3 + (s.like / 100) * 0.7,
                        animationDelay: `${i * 45 + 250}ms`,
                      }}
                    />
                  )}
                </span>
              ))}
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 mt-3">
              <span className="stat-label" style={{ color: GOLD }}>
                Did we play like Barça?
              </span>
              <span className="text-xs text-muted-foreground">
                {most && (
                  <>
                    Most: <b className="text-foreground">{most.like}</b> {most.home ? "v" : "at"} {most.opponent} ({most.gf}–{most.ga})
                  </>
                )}
                {least && least !== most && (
                  <>
                    {" · "}Least: <b className="text-foreground">{least.like}</b> {least.home ? "v" : "at"} {least.opponent} ({least.gf}–{least.ga})
                  </>
                )}
              </span>
            </div>
            <p className="text-xs text-muted-foreground/70 mt-1.5">
              Possession, accurate passes, final-third entries, big chances and xG in each
              match, against Barça&apos;s own average this season. 50 is a typical night.
            </p>
          </>
        )}

        {/* The same season with the two threads woven together: the scarf says
            which nights were won, the gold bars say how they were played, and
            neither says by how much. */}
        <SeasonWave
          matches={scarf.map((s) => ({
            gd: s.gf - s.ga,
            result: s.result,
            like: s.like,
          }))}
        />
      </section>

      <div className="grid lg:grid-cols-2 gap-5">
        {next && (
          <section className="surface rounded-2xl bg-card p-5">
            <Heading
              note={`${LEAGUE_ABBR[next.league] ?? next.league} · ${next.kickoff ? formatDateIST(next.kickoff) : next.date}`}
            >
              Next opponent
            </Heading>
            <div className="flex items-center gap-3">
              {opponentCrest != null && <TeamCrest teamId={opponentCrest} name={next.opponent} size={44} />}
              <div className="min-w-0 flex-1">
                <div
                  className="text-2xl font-bold uppercase tracking-[-0.02em] leading-none truncate"
                  style={{ fontFamily: "var(--font-condensed)", color: clubColor(next.opponent) ?? undefined }}
                >
                  {next.opponent}
                </div>
                <div className="stat-label mt-1.5">
                  {next.atHome ? "Home" : "Away"}
                  {next.record && ` · ${next.record}`}
                </div>
              </div>
              <div className="flex gap-1 shrink-0" title="Their last five, oldest first">
                {next.form.map((r, i) => (
                  <span
                    key={i}
                    className="size-5 rounded-full text-[0.6rem] font-bold flex items-center justify-center"
                    style={{
                      background: r === "W" ? "var(--pitch)" : r === "D" ? "oklch(0.58 0 0)" : "oklch(0.55 0.16 25)",
                      color: "#000",
                    }}
                  >
                    {r}
                  </span>
                ))}
              </div>
            </div>

            {next.traits.length > 0 && (
              <div className="mt-4 space-y-1.5">
                {next.traits.map((t) => {
                  // Top third of their league is a strength, bottom third a weakness.
                  const tone =
                    t.rank <= Math.ceil(t.of / 3)
                      ? "oklch(0.65 0.16 25)"
                      : t.rank > Math.floor((t.of * 2) / 3)
                        ? "var(--pitch)"
                        : "var(--muted-foreground)"
                  return (
                    <div key={t.label} className="flex items-center gap-3 text-sm">
                      <span className="flex-1 min-w-0 truncate text-muted-foreground">{t.label}</span>
                      <span className="stat-figure text-sm tabular-nums">{t.value}</span>
                      <span className="stat-label w-16 text-right tabular-nums" style={{ color: tone }}>
                        {t.rank} of {t.of}
                      </span>
                    </div>
                  )
                })}
                <p className="text-xs text-muted-foreground/70 pt-1">
                  Per game, ranked in their league. Red is where they are strong, green where they can be got at.
                </p>
              </div>
            )}

            <div className="mt-4 pt-3 border-t border-white/5 flex flex-wrap items-center justify-between gap-3">
              {next.threat ? (
                <Link href={`/player/${next.threat.slug}`} className="min-w-0 hover:underline">
                  <span className="stat-label block">Main threat</span>
                  <span className="text-sm font-medium">
                    {/* Only the name travels — the archetype and the tallies
                        belong to this card and have nothing to pair with on
                        the player page. No claimer here: the card names one
                        player, and the squad page around it pairs portraits
                        under `player-<id>`, a separate namespace. */}
                    <PlayerTitle name={playerTitleName(next.threat.slug)}>
                      <span>{next.threat.player}</span>
                    </PlayerTitle>
                    <span className="text-muted-foreground font-normal">
                      {" "}· {next.threat.archetype} · {next.threat.goals}G {next.threat.assists}A
                    </span>
                  </span>
                </Link>
              ) : (
                <span />
              )}
              <Link
                href={`/predictions/match?id=${next.event_id}`}
                className="text-right hover:underline shrink-0"
              >
                <span className="stat-label block">Model</span>
                <span className="stat-figure text-sm">
                  {next.odds
                    ? `${Math.round(next.odds.win)}% win · ${Math.round(next.odds.draw)}% draw`
                    : "See prediction →"}
                </span>
              </Link>
            </div>
          </section>
        )}

        {title && (
          <section className="surface rounded-2xl bg-card p-5">
            <Heading note="points gap by round · above the line is ahead">Title race</Heading>
            <p className="text-sm mb-2">
              <span className="stat-figure text-2xl mr-2" style={{ color: title.now >= 0 ? "var(--pitch)" : "oklch(0.65 0.16 25)" }}>
                {title.now > 0 ? "+" : ""}
                {title.now}
              </span>
              <span className="text-muted-foreground">
                on {title.rivals[0].team}. On chances it would be{" "}
                <b className="text-foreground">
                  {title.deserved > 0 ? "+" : ""}
                  {title.deserved.toFixed(1)}
                </b>
                .
              </span>
            </p>
            <TitleRaceChart
              rows={title.rows}
              rivals={title.rivals}
              deservedLabel={`Deserved vs ${title.rivals[0].team}`}
            />
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
              {title.rivals.map((r) => (
                <span key={r.team} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="w-3 h-[3px] rounded-full" style={{ background: r.color }} />
                  vs {r.team}
                </span>
              ))}
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="w-3 border-t border-dashed" style={{ borderColor: title.rivals[0].color }} />
                deserved
              </span>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
