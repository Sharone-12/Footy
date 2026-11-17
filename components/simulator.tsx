"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import {
  ChevronRightIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  SparklesIcon,
  TrophyIcon,
  XIcon,
} from "lucide-react"
import { SlidingSegment } from "@/components/sliding-segment"
import { TeamCrest, LeagueCrest } from "@/components/player-avatar"
import { Flip } from "@/components/flip"
import { Rondo } from "@/components/rondo"
import { BARCA_ID, LEAGUE_TOURNAMENT_ID } from "@/lib/teams"
import { UCL } from "@/lib/competition"
import { formatDateIST } from "@/lib/time"
import {
  drawBracket,
  knockoutRng,
  playKnockouts,
  rng,
  roundsOf,
  simulateRounds,
  uclZone,
  KO_LABEL,
  KO_STAGES,
  type Bracket,
  type Comp,
  type SimPack,
  type SimResult,
  type SimRow,
  type Tie,
} from "@/lib/simulate"

const BARCA = "FC Barcelona"
const STEP_MS = 750
const ROW = 30
const GOLD = "#EDBB00"

const COMPS: { key: Comp; label: string; league: string }[] = [
  { key: "league", label: "La Liga", league: "La Liga" },
  { key: "ucl", label: "UCL", league: UCL },
]

const fmtDate = (d: string) => formatDateIST(d.includes("T") ? d : `${d}T12:00:00Z`)

function Button({
  onClick, disabled, primary, children, title,
}: {
  onClick: () => void; disabled?: boolean; primary?: boolean; children: ReactNode; title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex items-center gap-1.5 rounded-full px-3.5 h-9 text-xs font-semibold tracking-wide uppercase transition-all disabled:opacity-35 disabled:cursor-not-allowed hover:-translate-y-px ${
        primary ? "surface-raised" : "bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15"
      }`}
      style={primary ? { background: "var(--primary)", color: "var(--primary-foreground)", fontFamily: "var(--font-condensed)" } : { fontFamily: "var(--font-condensed)" }}
    >
      {children}
    </button>
  )
}

/** The goals that made a scoreline: minute, scorer, assist. */
function GoalList({ m, ids }: { m: SimResult; ids: Record<string, number> }) {
  if (m.goals.length === 0) return null
  return (
    <ul className="stagger mt-2 grid gap-y-0.5 text-xs text-muted-foreground">
      {m.goals.map((g, i) => (
        <li key={i} className="flex items-center gap-1.5 min-w-0">
          {ids[g.team] != null && <TeamCrest teamId={ids[g.team]} name={g.team} size={14} />}
          <span className="stat-figure text-[0.7rem] w-7 shrink-0 tabular-nums">{g.minute}&apos;</span>
          <span className="truncate">
            <span className="text-foreground font-medium">{g.scorer ?? "Unknown"}</span>
            {g.assist && <span className="opacity-80"> · {g.assist}</span>}
          </span>
        </li>
      ))}
    </ul>
  )
}

/** One Barça fixture, as the fixtures tab draws it, filling in when its round is played. */
function BarcaFixture({
  f, result, ids, latest, league,
}: {
  f: { event_id: number; round: number; date: string; home: string; away: string }
  result: SimResult | undefined
  ids: Record<string, number>
  latest: boolean
  league: string
}) {
  const atHome = f.home === BARCA
  const opponent = atHome ? f.away : f.home
  const [ours, theirs] = result ? (atHome ? [result.hg, result.ag] : [result.ag, result.hg]) : [null, null]
  const outcome = ours == null ? null : ours > theirs! ? "W" : ours < theirs! ? "L" : "D"
  const tone = outcome === "W" ? "var(--pitch)" : outcome === "D" ? "oklch(0.58 0 0)" : "oklch(0.60 0.18 25)"
  const tid = LEAGUE_TOURNAMENT_ID[league]
  return (
    <li
      data-latest={latest || undefined}
      className={`rounded-2xl px-4 py-3 transition-[background,box-shadow,opacity] duration-500 ${
        latest ? "bg-black/5 dark:bg-white/[0.07] ring-1 ring-[var(--sim-accent)]" : "bg-black/[0.02] dark:bg-white/[0.03]"
      } ${result ? "" : "opacity-70"}`}
    >
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-2 w-24 shrink-0">
          {outcome ? (
            <span
              className="stat-pop size-5 rounded-full grid place-items-center text-[0.6rem] font-bold text-white shrink-0"
              style={{ background: tone }}
            >
              {outcome}
            </span>
          ) : (
            <span className="size-5 rounded-full border border-dashed border-current opacity-30 shrink-0" />
          )}
          <span className="flex flex-col leading-none">
            <span className="stat-label text-[0.6rem]">Matchday {f.round}</span>
            <span className="stat-label text-[0.6rem] mt-0.5 opacity-80">{fmtDate(f.date)}</span>
          </span>
        </span>
        <span className="flex items-center gap-2 min-w-0 flex-1">
          <TeamCrest teamId={BARCA_ID} name={BARCA} size={26} />
          <span className="stat-label text-[0.6rem]">{atHome ? "vs" : "at"}</span>
          {ids[opponent] != null && <TeamCrest teamId={ids[opponent]} name={opponent} size={26} />}
          <span className="truncate font-semibold text-[0.95rem]">{opponent}</span>
        </span>
        <span className="stat-figure text-xl shrink-0 tabular-nums w-14 text-right">
          {ours == null ? (
            <span className="opacity-30">–</span>
          ) : (
            <>
              <Flip value={ours} />
              <span className="opacity-50 mx-0.5">–</span>
              <Flip value={theirs!} />
            </>
          )}
        </span>
        {tid && <LeagueCrest tournamentId={tid} name={league} size={18} />}
      </div>
      {result && <GoalList m={result} ids={ids} />}
    </li>
  )
}

/** The table, every row absolutely placed so clubs glide past each other. */
function LiveTable({ rows, comp, ids }: { rows: SimRow[]; comp: Comp; ids: Record<string, number> }) {
  // Mounted in a fixed order so a row keeps its element as it moves.
  const teams = useMemo(() => rows.map((r) => r.team).sort(), [rows])
  const rank = new Map(rows.map((r, i) => [r.team, i]))
  const zone = (i: number) => {
    if (comp === "ucl") return uclZone(i + 1)
    return i < 4 ? "r16" : i < 6 ? "playoff" : i >= rows.length - 3 ? "out" : "mid"
  }
  const ZONE = { r16: "var(--pitch)", playoff: "var(--tone-amber)", out: "var(--tone-red)", mid: "transparent" }
  const cols = "grid-cols-[1.5rem_1fr_2rem_2.25rem_2.5rem]"
  return (
    <div>
      <div className={`grid ${cols} gap-x-1 px-2 stat-label text-[0.6rem] mb-1`}>
        <span>#</span><span>Club</span><span className="text-right">P</span><span className="text-right">GD</span><span className="text-right">Pts</span>
      </div>
      <div className="relative" style={{ height: rows.length * ROW }}>
        {teams.map((team) => {
          const i = rank.get(team) ?? 0
          const r = rows[i]
          const isBarca = team === BARCA
          return (
            <div
              key={team}
              className={`race-row absolute inset-x-0 top-0 grid ${cols} gap-x-1 items-center px-2 rounded-lg text-[0.8rem] ${
                isBarca ? "barca-stripes text-white" : ""
              }`}
              style={{ height: ROW - 2, transform: `translateY(${i * ROW}px)`, boxShadow: `inset 3px 0 0 ${ZONE[zone(i)]}` }}
            >
              <span className="stat-figure text-xs tabular-nums">{i + 1}</span>
              <span className="flex items-center gap-1.5 min-w-0">
                {ids[team] != null && <TeamCrest teamId={ids[team]} name={team} size={16} />}
                <span className="truncate font-medium">{team}</span>
              </span>
              <span className="text-right tabular-nums opacity-70">{r.played}</span>
              <span className="text-right tabular-nums opacity-70">{r.gf - r.ga > 0 ? "+" : ""}{r.gf - r.ga}</span>
              <span className="stat-figure text-sm text-right tabular-nums"><Flip value={r.pts} /></span>
            </div>
          )
        })}
      </div>
      <p className="stat-label text-[0.6rem] mt-2 flex flex-wrap gap-x-3">
        <span style={{ color: ZONE.r16 }}>{comp === "ucl" ? "1–8 round of 16" : "1–4 Champions League"}</span>
        <span style={{ color: ZONE.playoff }}>{comp === "ucl" ? "9–24 play-offs" : "5–6 Europe"}</span>
        <span style={{ color: ZONE.out }}>{comp === "ucl" ? "25–36 out" : "relegation"}</span>
      </p>
    </div>
  )
}

// ── Bracket ──

function TieRow({
  team, score, win, lose, placeholder, ids, pens,
}: {
  team: string | null; score?: number; win: boolean; lose: boolean; placeholder: string
  ids: Record<string, number>; pens?: boolean
}) {
  return (
    <div className={`bk-row flex items-center gap-1.5 px-2 h-8 min-w-0 ${win ? "bk-win" : ""}`} style={{ opacity: lose ? 0.45 : 1 }}>
      {team ? (
        <>
          {ids[team] != null && <TeamCrest teamId={ids[team]} name={team} size={16} />}
          <span key={team} className="animate-slide-up truncate text-[0.72rem] font-semibold flex-1">{team}</span>
          {score != null && (
            <span className="stat-pop stat-figure text-sm tabular-nums">
              {score}
              {win && pens && <span className="text-[0.55rem] ml-0.5 align-top">p</span>}
            </span>
          )}
        </>
      ) : (
        <span className="stat-label text-[0.55rem] opacity-60 truncate">{placeholder}</span>
      )}
    </div>
  )
}

function legLine(t: Tie) {
  const legs = t.legs.map((l) => `${l.hg}–${l.ag}`).join(" · ")
  const last = t.legs[t.legs.length - 1]
  return `${t.legs.length === 2 ? "legs " : ""}${legs}${last?.et ? " aet" : ""}${t.pens ? " · pens" : ""}`
}

function TieCard({ t, ids, slotA, slotB }: { t: Tie; ids: Record<string, number>; slotA: string; slotB: string }) {
  return (
    <div className="bk-tie rounded-lg overflow-hidden" data-done={t.winner ? "" : undefined}>
      <TieRow team={t.a} score={t.agg?.[0]} win={!!t.a && t.winner === t.a} lose={!!t.winner && t.winner !== t.a} placeholder={slotA} ids={ids} pens={t.pens} />
      <TieRow team={t.b} score={t.agg?.[1]} win={!!t.b && t.winner === t.b} lose={!!t.winner && t.winner !== t.b} placeholder={slotB} ids={ids} pens={t.pens} />
      {t.legs.length > 0 && <div className="stat-label text-[0.55rem] px-2 pb-1 opacity-80 truncate">{legLine(t)}</div>}
    </div>
  )
}

function Slot({ children, done }: { children: ReactNode; done?: boolean }) {
  return <div className="bk-slot" data-done={done ? "" : undefined}>{children}</div>
}

/** One half of the bracket: four R16 ties, two quarter-finals, one semi. */
function Half({ b, side, ids }: { b: Bracket; side: 0 | 1; ids: Record<string, number> }) {
  const r16 = b.r16.slice(side * 4, side * 4 + 4)
  const qf = b.qf.slice(side * 2, side * 2 + 2)
  const sf = b.sf[side]
  const cols = [
    <div key="r16" className="bk-col bk-first">
      {[0, 2].map((i) => (
        <div key={i} className="bk-pair bk-two">
          {r16.slice(i, i + 2).map((t) => (
            <Slot key={t.id} done={!!t.winner}><TieCard t={t} ids={ids} slotA="Seed" slotB="Play-off winner" /></Slot>
          ))}
        </div>
      ))}
    </div>,
    <div key="qf" className="bk-col">
      <div className="bk-pair bk-two">
        {qf.map((t) => (
          <Slot key={t.id} done={!!t.winner}><TieCard t={t} ids={ids} slotA="R16 winner" slotB="R16 winner" /></Slot>
        ))}
      </div>
    </div>,
    <div key="sf" className="bk-col">
      <div className="bk-pair">
        <Slot done={!!sf.winner}><TieCard t={sf} ids={ids} slotA="QF winner" slotB="QF winner" /></Slot>
      </div>
    </div>,
  ]
  return <>{side === 0 ? cols : cols.reverse()}</>
}

function BracketView({ b, ids }: { b: Bracket; ids: Record<string, number> }) {
  const final = b.final[0]
  return (
    <div className="overflow-x-auto no-scrollbar -mx-5 px-5">
      <div className="bracket">
        <div className="bk-l contents"><Half b={b} side={0} ids={ids} /></div>
        <div className="bk-col bk-final">
          <div className="bk-pair">
            <div className="bk-trophy" aria-hidden>
              <LeagueCrest tournamentId={LEAGUE_TOURNAMENT_ID[UCL]} name={UCL} size={44} variant="transparent" />
            </div>
            <Slot done={!!final.winner}>
              <div className="stat-label text-[0.55rem] text-center mb-1">Final</div>
              <TieCard t={final} ids={ids} slotA="SF winner" slotB="SF winner" />
            </Slot>
          </div>
        </div>
        <div className="bk-r contents"><Half b={b} side={1} ids={ids} /></div>
      </div>
    </div>
  )
}

// ── The simulator ──

type Run = { seed: number; played: number; ko: number; drawn: boolean; playing: boolean }

const fresh = (): Run => ({ seed: (Date.now() ^ (Math.random() * 1e9)) >>> 0, played: 0, ko: 0, drawn: false, playing: false })

/**
 * The season played out from today's table. `nav` is the section nav that
 * shares the row with the toggle.
 */
export function Simulator({ nav }: { nav: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [comp, setComp] = useState<Comp>("league")
  const [packs, setPacks] = useState<Partial<Record<Comp, SimPack | "error">>>({})
  const [run, setRun] = useState<Run>({ seed: 1, played: 0, ko: 0, drawn: false, playing: false })
  const listRef = useRef<HTMLUListElement>(null)

  const pack = packs[comp]
  const ready = pack && pack !== "error" ? pack : null

  useEffect(() => {
    if (!open || packs[comp]) return
    let alive = true
    fetch(`/api/simulate?comp=${comp}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((p: SimPack) => alive && setPacks((s) => ({ ...s, [comp]: p })))
      .catch(() => alive && setPacks((s) => ({ ...s, [comp]: "error" })))
    return () => {
      alive = false
    }
  }, [open, comp, packs])

  const total = ready ? roundsOf(ready).length : 0
  const played = Math.min(run.played, total)
  const leagueDone = total > 0 && played >= total

  // Autoplay, one round a beat, stopping itself on the last one.
  const playing = run.playing && !leagueDone
  useEffect(() => {
    if (!playing) return
    const id = setTimeout(
      () => setRun((s) => ({ ...s, played: s.played + 1, playing: s.played + 1 < total })),
      STEP_MS,
    )
    return () => clearTimeout(id)
  }, [playing, played, total])

  const sim = useMemo(() => (ready ? simulateRounds(ready, run.seed, played) : null), [ready, run.seed, played])

  const bracket = useMemo(() => {
    if (!ready || ready.comp !== "ucl" || !sim || !leagueDone || !run.drawn) return null
    const drawn = drawBracket(sim.table.map((t) => t.team), rng(run.seed ^ 0x5bd1e995))
    return playKnockouts(drawn, run.ko, ready, knockoutRng(run.seed))
  }, [ready, sim, leagueDone, run.drawn, run.ko, run.seed])

  // Keep the newest simulated Barça fixture in view.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>("[data-latest]")?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }, [played])

  const barcaFixtures = useMemo(
    () => (ready ? ready.fixtures.filter((f) => f.home === BARCA || f.away === BARCA).sort((a, b) => a.round - b.round) : []),
    [ready],
  )
  const resultById = useMemo(() => {
    const m = new Map<number, SimResult>()
    for (const r of sim?.rounds ?? []) for (const x of r.results) if (x.event_id != null) m.set(x.event_id, x)
    return m
  }, [sim])
  const lastRound = sim?.rounds[sim.rounds.length - 1]
  const latestBarca = lastRound?.results.find((m) => m.home === BARCA || m.away === BARCA)?.event_id

  // Barça's scorers and assisters across everything simulated so far.
  const leaders = useMemo(() => {
    const goals = new Map<string, number>()
    const assists = new Map<string, number>()
    const all: SimResult[] = [...(sim?.rounds.flatMap((r) => r.results) ?? [])]
    if (bracket) for (const stage of KO_STAGES) for (const t of bracket[stage]) all.push(...t.legs)
    for (const m of all) for (const g of m.goals) {
      if (g.team !== BARCA) continue
      if (g.scorer) goals.set(g.scorer, (goals.get(g.scorer) ?? 0) + 1)
      if (g.assist) assists.set(g.assist, (assists.get(g.assist) ?? 0) + 1)
    }
    const top = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1])[0] ?? null
    const season = (name: string, key: "goals" | "assists") => ready?.squads[BARCA]?.find((p) => p.player === name)?.[key] ?? 0
    const g = top(goals)
    const a = top(assists)
    return {
      scorer: g && { name: g[0], sim: g[1], total: g[1] + season(g[0], "goals") },
      assister: a && { name: a[0], sim: a[1], total: a[1] + season(a[0], "assists") },
    }
  }, [sim, bracket, ready])

  const barcaRank = sim ? sim.table.findIndex((t) => t.team === BARCA) + 1 : 0
  const champion = bracket?.final[0].winner ?? null
  const koStage = bracket ? run.ko : 0
  const barcaOut = bracket
    ? KO_STAGES.slice(0, koStage).find((s) => bracket[s].some((t) => (t.a === BARCA || t.b === BARCA) && t.winner && t.winner !== BARCA))
    : null

  const pick = (c: Comp) => {
    setComp(c)
    setRun(fresh())
  }

  const roundsLabel = ready
    ? leagueDone
      ? `All ${total} matchdays played`
      : `Matchday ${roundsOf(ready)[played]} next · ${played} of ${total} simulated`
    : ""

  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-center gap-3">
        {nav}
        <button
          type="button"
          onClick={() => {
            if (!open) setRun(fresh())
            setOpen((o) => !o)
          }}
          aria-pressed={open}
          className={`inline-flex items-center gap-1.5 rounded-full px-3.5 h-10 text-xs font-semibold tracking-wide uppercase transition-all hover:-translate-y-px ${
            open ? "barca-stripes-pill text-white shadow-[0_0_18px_-4px_#EDBB00]" : "segment text-muted-foreground hover:text-foreground"
          }`}
          style={{ fontFamily: "var(--font-condensed)" }}
        >
          <SparklesIcon className="size-4" style={{ color: open ? GOLD : undefined }} />
          Simulate
          {open && <XIcon className="size-3.5 opacity-70" />}
        </button>
      </div>

      {open && (
        <section
          className={`animate-slide-up mt-4 rounded-2xl p-5 ${comp === "ucl" ? "ucl-row text-white" : "surface bg-card"}`}
          style={{ ["--sim-accent" as string]: comp === "ucl" ? "#19b7ff" : GOLD }}
        >
          <header className="flex flex-wrap items-center justify-between gap-3 pb-4">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold tracking-tight uppercase" style={{ fontFamily: "var(--font-condensed)" }}>
                Simulate the season
              </h2>
              <p className="stat-label mt-0.5 truncate">
                {roundsLabel || "Poisson draws from the prediction model · possession, xG, shots and defence all priced in"}
              </p>
            </div>
            <SlidingSegment
              ariaLabel="Competition to simulate"
              activeKey={comp}
              items={COMPS.map((c) => ({
                key: c.key,
                label: c.label,
                node: (
                  <span className="flex items-center gap-1.5">
                    <LeagueCrest tournamentId={LEAGUE_TOURNAMENT_ID[c.league]} name={c.league} size={18} variant="circle" />
                    {c.label}
                  </span>
                ),
                onPick: () => pick(c.key),
              }))}
            />
          </header>

          {/* Progress through the remaining rounds. */}
          <div className="h-[3px] rounded-full bg-black/10 dark:bg-white/10 overflow-hidden mb-4">
            <div
              className="h-full rounded-full transition-[width] duration-500 ease-out"
              style={{ width: `${total ? (played / total) * 100 : 0}%`, background: "var(--sim-accent)" }}
            />
          </div>

          {pack === "error" ? (
            <p className="text-sm text-muted-foreground">Couldn&apos;t load the season. Try again in a moment.</p>
          ) : !ready || !sim ? (
            <Rondo label="Rating every fixture" className="h-[220px] !bg-transparent !shadow-none" />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 mb-5">
                <Button primary onClick={() => setRun((s) => ({ ...s, played: s.played + 1, playing: false }))} disabled={leagueDone}>
                  Next matchday <ChevronRightIcon className="size-4" />
                </Button>
                <Button onClick={() => setRun((s) => ({ ...s, playing: !playing }))} disabled={leagueDone}>
                  {playing ? <PauseIcon className="size-3.5" /> : <PlayIcon className="size-3.5" />}
                  {playing ? "Pause" : "Play to the end"}
                </Button>
                <Button onClick={() => setRun(fresh())} title="New draw, from today's table">
                  <RotateCcwIcon className="size-3.5" /> Re-run
                </Button>
              </div>

              <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] gap-5">
                {/* Barça's fixtures, filling in round by round. */}
                <div className="min-w-0">
                  <h3 className="stat-label mb-2">Barça fixtures</h3>
                  <ul ref={listRef} className="flex flex-col gap-2 max-h-[600px] overflow-y-auto no-scrollbar pr-0.5">
                    {barcaFixtures.map((f) => (
                      <BarcaFixture
                        key={f.event_id}
                        f={f}
                        result={resultById.get(f.event_id)}
                        ids={ready.ids}
                        latest={f.event_id === latestBarca}
                        league={ready.league}
                      />
                    ))}
                  </ul>
                  {lastRound && (
                    <div className="mt-4">
                      <h3 className="stat-label mb-1.5">Matchday {lastRound.round} elsewhere</h3>
                      <ul className="stagger grid sm:grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
                        {lastRound.results.filter((m) => m.home !== BARCA && m.away !== BARCA).map((m) => (
                          <li key={m.event_id} className="flex items-center gap-1.5 min-w-0 py-0.5">
                            <span className="truncate flex-1 text-right opacity-80">{m.home}</span>
                            <span className="stat-figure text-xs tabular-nums w-10 text-center bg-black/5 dark:bg-white/10 rounded px-1 py-0.5">
                              {m.hg}–{m.ag}
                            </span>
                            <span className="truncate flex-1 opacity-80">{m.away}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {/* The table, and what Barça are doing in it. */}
                <div className="min-w-0">
                  {(leaders.scorer || leaders.assister || leagueDone) && (
                    <div className="grid grid-cols-2 gap-2 mb-4">
                      {leagueDone && (
                        <div className="col-span-2 rounded-xl px-3 py-2.5 bg-black/5 dark:bg-white/[0.07]">
                          <span className="stat-label block">{comp === "ucl" ? "League phase" : "Final table"}</span>
                          <span
                            className="stat-pop block text-lg font-bold uppercase leading-tight"
                            style={{ fontFamily: "var(--font-condensed)", color: barcaRank === 1 ? "var(--sim-accent)" : undefined }}
                          >
                            {comp === "ucl"
                              ? `Barça finish ${barcaRank} · ${
                                  uclZone(barcaRank) === "r16" ? "straight to the last 16" : uclZone(barcaRank) === "playoff" ? "into the play-offs" : "out of Europe"
                                }`
                              : barcaRank === 1
                                ? "Barça are champions"
                                : `Barça finish ${barcaRank} · ${sim.table[0].team} win the league`}
                          </span>
                        </div>
                      )}
                      {leaders.scorer && (
                        <div className="rounded-xl px-3 py-2 bg-black/5 dark:bg-white/[0.07] min-w-0">
                          <span className="stat-label block">Top scorer</span>
                          <span className="block text-sm font-semibold truncate">{leaders.scorer.name}</span>
                          <span className="stat-figure text-base" style={{ color: "var(--sim-accent)" }}>
                            <Flip value={leaders.scorer.sim} />
                          </span>
                          <span className="stat-label text-[0.55rem] ml-1.5">sim · {leaders.scorer.total} season</span>
                        </div>
                      )}
                      {leaders.assister && (
                        <div className="rounded-xl px-3 py-2 bg-black/5 dark:bg-white/[0.07] min-w-0">
                          <span className="stat-label block">Top assister</span>
                          <span className="block text-sm font-semibold truncate">{leaders.assister.name}</span>
                          <span className="stat-figure text-base" style={{ color: "var(--sim-accent)" }}>
                            <Flip value={leaders.assister.sim} />
                          </span>
                          <span className="stat-label text-[0.55rem] ml-1.5">sim · {leaders.assister.total} season</span>
                        </div>
                      )}
                    </div>
                  )}
                  <h3 className="stat-label mb-2">{leagueDone ? "Final table" : "Table"}</h3>
                  <div className="max-h-[600px] overflow-y-auto no-scrollbar">
                    <LiveTable rows={sim.table} comp={comp} ids={ready.ids} />
                  </div>
                </div>
              </div>

              {/* Knockouts: drawn from the final table, played one round at a time. */}
              {comp === "ucl" && leagueDone && (
                <div className="mt-6 pt-5 border-t border-white/10">
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <div>
                      <h3 className="text-lg font-semibold tracking-tight uppercase" style={{ fontFamily: "var(--font-condensed)" }}>
                        Knockout phase
                      </h3>
                      <p className="stat-label mt-0.5">
                        {champion
                          ? `${champion} are champions of Europe`
                          : barcaOut
                            ? `Barça out in the ${KO_LABEL[barcaOut].toLowerCase()}`
                            : bracket
                              ? koStage === 0
                                ? "Drawn by seeding: 1–8 wait, 9–24 play off"
                                : `${KO_LABEL[KO_STAGES[koStage - 1]]} played`
                              : "Seeds 1–8 skip to the last 16; 9 v 24, 10 v 23 … 16 v 17 play off"}
                      </p>
                    </div>
                    {!bracket ? (
                      <Button primary onClick={() => setRun((s) => ({ ...s, drawn: true, ko: 0 }))}>
                        Draw the bracket <ChevronRightIcon className="size-4" />
                      </Button>
                    ) : koStage < KO_STAGES.length ? (
                      <Button primary onClick={() => setRun((s) => ({ ...s, ko: s.ko + 1 }))}>
                        Simulate {KO_LABEL[KO_STAGES[koStage]].toLowerCase()} <ChevronRightIcon className="size-4" />
                      </Button>
                    ) : (
                      <span
                        className="stat-pop inline-flex items-center gap-2 rounded-full px-4 h-9 text-sm font-bold uppercase"
                        style={{ background: "var(--sim-accent)", color: "#07132e", fontFamily: "var(--font-condensed)" }}
                      >
                        <TrophyIcon className="size-4" /> {champion}
                      </span>
                    )}
                  </div>

                  {bracket && (
                    <>
                      <h4 className="stat-label mb-2">{KO_LABEL.playoffs}</h4>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
                        {bracket.playoffs.map((t) => (
                          <TieCard key={t.id} t={t} ids={ready.ids} slotA="Seed 9–16" slotB="Seed 17–24" />
                        ))}
                      </div>
                      <BracketView b={bracket} ids={ready.ids} />
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      )}
    </div>
  )
}
