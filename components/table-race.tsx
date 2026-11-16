"use client"

import { useEffect, useMemo, useState } from "react"
import { PauseIcon, PlayIcon } from "lucide-react"
import { LeagueCrest, TeamCrest } from "@/components/player-avatar"
import { SlidingSegment } from "@/components/sliding-segment"
import { Flip } from "@/components/flip"
import { LEAGUE_ABBR, LEAGUE_TOURNAMENT_ID } from "@/lib/teams"
import type { Race } from "@/lib/justice"

const ROW = 30
const STEP_MS = 900

/**
 * The league table replayed round by round.
 *
 * Every row is absolutely positioned and only its transform changes between
 * rounds, so a club overtaking another is one compositor animation per row
 * rather than a re-layout of the list.
 */
export function TableRace({
  races,
  teamIds,
}: {
  races: Race[]
  teamIds: Map<string, number>
}) {
  const [leagueIdx, setLeagueIdx] = useState(0)
  const race = races[Math.min(leagueIdx, races.length - 1)]
  const last = race.rounds.length - 1
  // Opens on today's table; Play rewinds to round one.
  const [step, setStep] = useState(last)
  const [playing, setPlaying] = useState(false)
  const at = Math.min(step, last)

  useEffect(() => {
    if (!playing || at >= last) return
    const id = setTimeout(() => {
      setStep(at + 1)
      if (at + 1 >= last) setPlaying(false)
    }, STEP_MS)
    return () => clearTimeout(id)
  }, [playing, at, last])

  const rankOf = useMemo(() => {
    const pts = race.points[at]
    const gd = race.gd[at]
    const order = race.teams
      .map((_, i) => i)
      .sort((a, b) => pts[b] - pts[a] || gd[b] - gd[a] || race.teams[a].localeCompare(race.teams[b]))
    const rank = new Array<number>(race.teams.length)
    order.forEach((team, position) => (rank[team] = position))
    return rank
  }, [race, at])

  // Scaled to the final leader, so the bars fill up as the season goes.
  const top = Math.max(1, ...race.points[last])

  const play = () => {
    if (playing) return setPlaying(false)
    if (at >= last) setStep(0)
    setPlaying(true)
  }

  return (
    <section className="surface rounded-2xl bg-card overflow-hidden">
      <header className="px-5 pt-5 pb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2
            className="text-lg font-semibold tracking-tight uppercase"
            style={{ fontFamily: "var(--font-condensed)" }}
          >
            Table Race
          </h2>
          <p className="stat-label mt-1">The season replayed, round by round</p>
        </div>
        {races.length > 1 && (
          <SlidingSegment
            ariaLabel="League"
            activeKey={race.league}
            items={races.map((r, i) => ({
              key: r.league,
              label: LEAGUE_ABBR[r.league] ?? r.league,
              // The competition's own crest; the abbreviation stays as the
              // fallback for one we hold no logo for.
              node: LEAGUE_TOURNAMENT_ID[r.league] ? (
                <span className="flex items-center" title={r.league}>
                  <LeagueCrest tournamentId={LEAGUE_TOURNAMENT_ID[r.league]} name={r.league} size={22} />
                </span>
              ) : undefined,
              onPick: () => {
                setPlaying(false)
                setLeagueIdx(i)
                setStep(r.rounds.length - 1)
              },
            }))}
          />
        )}
      </header>

      <div className="px-5 pb-3 flex items-center gap-3">
        <button
          type="button"
          onClick={play}
          aria-label={playing ? "Pause" : "Play the season"}
          className="surface-raised inline-flex items-center justify-center size-9 rounded-full shrink-0 transition-transform hover:-translate-y-px"
          style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
        >
          {playing ? <PauseIcon className="size-4" /> : <PlayIcon className="size-4 translate-x-px" />}
        </button>
        <input
          type="range"
          min={0}
          max={last}
          value={at}
          onChange={(e) => {
            setPlaying(false)
            setStep(Number(e.target.value))
          }}
          aria-label="Round"
          className="flex-1 accent-[var(--pitch)]"
        />
        <span className="stat-figure text-xl w-24 text-right tabular-nums">
          <span className="stat-label mr-1.5">Round</span>
          <Flip value={race.rounds[at]} />
        </span>
      </div>

      <div className="relative mx-3 mb-4" style={{ height: race.teams.length * ROW }}>
        {race.teams.map((team, i) => {
          const rank = rankOf[i]
          const pts = race.points[at][i]
          const isBarca = team === "FC Barcelona"
          return (
            <div
              key={team}
              className="race-row absolute inset-x-0 top-0 flex items-center gap-2 px-2"
              style={{ height: ROW, transform: `translateY(${rank * ROW}px)` }}
            >
              <span
                className="stat-figure text-sm w-5 text-right shrink-0"
                style={{
                  color: rank < 4 ? "var(--pitch)" : "var(--muted-foreground)",
                  opacity: rank < 4 ? 1 : 0.6,
                }}
              >
                {rank + 1}
              </span>
              {teamIds.get(team) != null && (
                <TeamCrest teamId={teamIds.get(team)!} name={team} size={18} />
              )}
              <span className="text-[0.85rem] font-medium truncate w-28 sm:w-44 shrink-0">
                {team}
              </span>
              <span className="flex-1 h-[10px] rounded-full overflow-hidden bg-black/5 dark:bg-white/[0.04]">
                <span
                  className={`race-bar block h-full rounded-full ${isBarca ? "barca-stripes" : ""}`}
                  style={{
                    width: `${Math.max(1.5, (pts / top) * 100)}%`,
                    background: isBarca ? undefined : "var(--pitch)",
                    opacity: isBarca ? 1 : rank < 4 ? 0.85 : 0.4,
                  }}
                />
              </span>
              <span className="stat-figure text-sm w-7 flex justify-end shrink-0 tabular-nums">
                <Flip value={pts} />
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
