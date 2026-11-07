"use client"

import { useState } from "react"
import type { H2HResponse, H2HMatch } from "@/app/api/livescores/h2h/route"
import type { LiveFixture } from "@/components/live-sections"
import { TeamCrest } from "@/components/player-avatar"
import { HistoryIcon, SwordsIcon } from "lucide-react"

type H2HHistoryProps = {
  h2hData: H2HResponse | null
  fixture: LiveFixture
  isLoading?: boolean
}

function MatchClubCrest({
  src,
  name,
  fallbackTeamId,
  size = 24,
}: {
  src?: string
  name: string
  fallbackTeamId?: number | string | null
  size?: number
}) {
  const [failed, setFailed] = useState(false)

  if (!src || failed) {
    if (fallbackTeamId) {
      return <TeamCrest teamId={fallbackTeamId} name={name} size={size} />
    }
    return (
      <span
        style={{ width: size, height: size }}
        className="rounded-full bg-white/10 border border-white/15 flex items-center justify-center font-bold text-[9px] text-white/70 shrink-0 select-none"
      >
        {name.slice(0, 2).toUpperCase()}
      </span>
    )
  }

  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={src}
      alt={name}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      style={{ width: size, height: size }}
      className="object-contain shrink-0 drop-shadow-xs select-none"
    />
  )
}

function FormPill({ result }: { result: string }) {
  const r = result.toUpperCase()
  let bg = "bg-neutral-800 text-white/60 border-white/10"
  let label = "Draw"
  if (r === "W") {
    bg = "bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-[0_0_6px_rgba(16,185,129,0.25)]"
    label = "Win"
  } else if (r === "D") {
    bg = "bg-amber-500/20 text-amber-400 border-amber-500/40 shadow-[0_0_6px_rgba(245,158,11,0.25)]"
    label = "Draw"
  } else if (r === "L") {
    bg = "bg-rose-500/20 text-rose-400 border-rose-500/40 shadow-[0_0_6px_rgba(244,63,94,0.25)]"
    label = "Loss"
  }

  return (
    <span
      className={`size-6 rounded-md font-mono font-bold text-xs flex items-center justify-center border ${bg} select-none transition-transform hover:scale-105`}
      title={label}
      aria-label={label}
    >
      {r}
    </span>
  )
}

export function H2HHistory({ h2hData, fixture, isLoading }: H2HHistoryProps) {
  if (isLoading) {
    return (
      <div className="h-64 flex flex-col items-center justify-center gap-3 bg-neutral-950/70 rounded-2xl border border-white/10">
        <div className="size-8 rounded-full border-2 border-white/10 border-t-[var(--pitch)] animate-spin" />
        <span className="text-xs text-muted-foreground font-mono">LOADING HEAD-TO-HEAD HISTORY...</span>
      </div>
    )
  }

  if (!h2hData || (h2hData.matches.length === 0 && h2hData.homeForm.length === 0)) {
    return (
      <div className="p-8 text-center bg-neutral-950/40 rounded-2xl border border-white/10 flex flex-col items-center gap-2">
        <HistoryIcon className="size-8 text-white/20 mb-1" />
        <h4 className="text-sm font-bold text-white/80">NO PREVIOUS H2H ENCOUNTERS</h4>
        <p className="text-xs text-muted-foreground max-w-sm">
          Head-to-head records are not available for this matchup.
        </p>
      </div>
    )
  }

  // Calculate H2H record against current match perspectives
  let homeWins = 0
  let draws = 0
  let awayWins = 0

  for (const m of h2hData.matches) {
    if (m.winner === "draw") {
      draws++
    } else if (m.home === fixture.home && m.winner === "home") {
      homeWins++
    } else if (m.away === fixture.home && m.winner === "away") {
      homeWins++
    } else {
      awayWins++
    }
  }

  const totalMatches = Math.max(1, homeWins + draws + awayWins)
  const homePercent = (homeWins / totalMatches) * 100
  const drawPercent = (draws / totalMatches) * 100
  const awayPercent = (awayWins / totalMatches) * 100

  return (
    <div className="flex flex-col gap-4">
      {/* 1. Aggregate Stats Banner & Recent Form */}
      <section
        aria-label="Head-to-head summary"
        className="p-4 sm:p-5 bg-neutral-950/90 rounded-2xl border border-white/10 shadow-xl"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-center">
          {/* Home Team & Form */}
          <div className="flex flex-col items-start gap-2 min-w-0">
            <div className="flex items-center gap-2.5">
              <MatchClubCrest
                src={h2hData.homeCrest}
                fallbackTeamId={fixture.home_id}
                name={fixture.home}
                size={36}
              />
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-white text-sm sm:text-base tracking-tight truncate">
                    {fixture.home}
                  </span>
                  <span className="px-1.5 py-0.2 rounded text-[9px] font-black uppercase tracking-wider bg-[var(--pitch)] text-black shrink-0">
                    HOME
                  </span>
                </div>
                <span className="text-[10px] text-neutral-400 font-medium">Recent Form</span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 pt-0.5">
              {h2hData.homeForm.length > 0 ? (
                h2hData.homeForm.map((f, i) => <FormPill key={`hf-${i}`} result={f} />)
              ) : (
                <span className="text-xs text-white/40">No recent form data</span>
              )}
            </div>
          </div>

          {/* Center: H2H Split & Record */}
          <div className="flex flex-col items-center justify-center gap-2 border-y md:border-y-0 md:border-x border-white/10 py-3 md:py-0 px-2">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-neutral-400 uppercase tracking-wider">
              <SwordsIcon className="size-3.5 text-[var(--pitch)]" />
              <span>H2H Historical Record</span>
            </div>

            {/* Wins & Draws breakdown pills */}
            <div className="flex items-center gap-2.5 font-mono text-xs font-bold">
              <span className="px-2 py-0.5 rounded-md bg-[var(--pitch)]/15 text-[var(--pitch)] border border-[var(--pitch)]/30">
                {homeWins} W
              </span>
              <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-400 border border-amber-500/30">
                {draws} D
              </span>
              <span className="px-2 py-0.5 rounded-md bg-sky-500/15 text-sky-400 border border-sky-500/30">
                {awayWins} W
              </span>
            </div>

            {/* Visual Balance Bar */}
            <div className="w-full max-w-[220px] h-2 rounded-full overflow-hidden flex bg-white/10 gap-0.5 mt-1 shadow-inner">
              {homeWins > 0 && (
                <div
                  style={{ width: `${homePercent}%` }}
                  className="bg-[var(--pitch)] h-full transition-all"
                  title={`${fixture.home}: ${homeWins} wins`}
                />
              )}
              {draws > 0 && (
                <div
                  style={{ width: `${drawPercent}%` }}
                  className="bg-amber-400 h-full transition-all"
                  title={`Draws: ${draws}`}
                />
              )}
              {awayWins > 0 && (
                <div
                  style={{ width: `${awayPercent}%` }}
                  className="bg-sky-400 h-full transition-all"
                  title={`${fixture.away}: ${awayWins} wins`}
                />
              )}
            </div>
          </div>

          {/* Away Team & Form */}
          <div className="flex flex-col items-start md:items-end gap-2 min-w-0">
            <div className="flex items-center gap-2.5 md:flex-row-reverse">
              <MatchClubCrest
                src={h2hData.awayCrest}
                fallbackTeamId={fixture.away_id}
                name={fixture.away}
                size={36}
              />
              <div className="flex flex-col min-w-0 md:items-end">
                <div className="flex items-center gap-1.5 md:flex-row-reverse">
                  <span className="font-bold text-white text-sm sm:text-base tracking-tight truncate">
                    {fixture.away}
                  </span>
                  <span className="px-1.5 py-0.2 rounded text-[9px] font-black uppercase tracking-wider bg-sky-400 text-black shrink-0">
                    AWAY
                  </span>
                </div>
                <span className="text-[10px] text-neutral-400 font-medium">Recent Form</span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 pt-0.5">
              {h2hData.awayForm.length > 0 ? (
                h2hData.awayForm.map((f, i) => <FormPill key={`af-${i}`} result={f} />)
              ) : (
                <span className="text-xs text-white/40">No recent form data</span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* 2. Previous Meetings List Card */}
      <section aria-label="Recent head-to-head encounters" className="flex flex-col gap-2">
        <header className="flex items-center justify-between px-2">
          <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-1.5">
            <HistoryIcon className="size-3.5 text-neutral-400" />
            <span>Recent Head-to-Head Encounters</span>
          </h4>
          <span className="text-[11px] font-mono text-neutral-500">
            {h2hData.matches.length} matches recorded
          </span>
        </header>

        <div className="flex flex-col divide-y divide-white/[0.04] rounded-2xl border border-white/10 bg-neutral-950/90 shadow-2xl overflow-hidden">
          {h2hData.matches.map((match, i) => {
            const homeIsFixtureHome = match.home === fixture.home
            const homeIsWinner = match.winner === "home"
            const awayIsWinner = match.winner === "away"
            const isDraw = match.winner === "draw"

            return (
              <div
                key={`h2h-match-${i}`}
                className="group flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:px-4 sm:py-3.5 hover:bg-white/[0.03] transition-colors gap-2 sm:gap-4"
              >
                {/* Competition Name & Date */}
                <div className="flex sm:flex-col items-center sm:items-start justify-between sm:justify-center w-full sm:w-40 shrink-0">
                  <span className="font-semibold text-neutral-300 text-xs truncate group-hover:text-white transition-colors">
                    {match.league}
                  </span>
                  <span className="text-[11px] font-mono text-neutral-500">
                    {match.date || "Past Encounter"}
                  </span>
                </div>

                {/* Matchup with Centered Clean Scoreline */}
                <div className="flex items-center justify-center flex-1 min-w-0 gap-2 sm:gap-3">
                  {/* Home Team */}
                  <div className="flex items-center justify-end gap-2 flex-1 min-w-0">
                    <span
                      className={`truncate text-xs sm:text-sm text-right ${
                        homeIsWinner
                          ? "font-bold text-white"
                          : isDraw
                          ? "font-medium text-neutral-300"
                          : "font-medium text-neutral-400"
                      }`}
                    >
                      {match.home}
                    </span>
                    <MatchClubCrest
                      src={match.homeCrest}
                      fallbackTeamId={homeIsFixtureHome ? fixture.home_id : fixture.away_id}
                      name={match.home}
                      size={24}
                    />
                  </div>

                  {/* Centered Score Badge */}
                  <div
                    className={`px-3 py-1 rounded-lg font-mono font-bold text-xs sm:text-sm tracking-wider shrink-0 flex items-center justify-center min-w-[58px] shadow-inner border transition-colors ${
                      homeIsWinner
                        ? "bg-neutral-900 border-white/20 text-white shadow-[0_0_8px_rgba(255,255,255,0.05)]"
                        : awayIsWinner
                        ? "bg-neutral-900 border-white/20 text-white shadow-[0_0_8px_rgba(255,255,255,0.05)]"
                        : "bg-neutral-900/80 border-white/10 text-neutral-300"
                    }`}
                  >
                    <span className={homeIsWinner ? "text-[var(--pitch)] font-black" : "text-white"}>
                      {match.homeScore}
                    </span>
                    <span className="mx-1.5 text-neutral-500 select-none">-</span>
                    <span className={awayIsWinner ? "text-sky-400 font-black" : "text-white"}>
                      {match.awayScore}
                    </span>
                  </div>

                  {/* Away Team */}
                  <div className="flex items-center justify-start gap-2 flex-1 min-w-0">
                    <MatchClubCrest
                      src={match.awayCrest}
                      fallbackTeamId={!homeIsFixtureHome ? fixture.home_id : fixture.away_id}
                      name={match.away}
                      size={24}
                    />
                    <span
                      className={`truncate text-xs sm:text-sm text-left ${
                        awayIsWinner
                          ? "font-bold text-white"
                          : isDraw
                          ? "font-medium text-neutral-300"
                          : "font-medium text-neutral-400"
                      }`}
                    >
                      {match.away}
                    </span>
                  </div>
                </div>

                {/* Outcome Pill on large screens */}
                <div className="hidden lg:flex items-center justify-end w-24 shrink-0 font-mono text-[10px] font-bold">
                  {homeIsWinner ? (
                    <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-white/80">
                      {match.home.slice(0, 3).toUpperCase()} WIN
                    </span>
                  ) : awayIsWinner ? (
                    <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-white/80">
                      {match.away.slice(0, 3).toUpperCase()} WIN
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-neutral-400">
                      DRAW
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
