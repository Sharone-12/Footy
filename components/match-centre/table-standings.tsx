"use client"

import { useState } from "react"
import type { LeagueTableResponse, TableRow } from "@/app/api/livescores/table/route"
import type { LiveFixture } from "@/components/live-sections"
import { TrophyIcon } from "lucide-react"
import { LeagueCrest } from "@/components/player-avatar"
import { LEAGUE_TOURNAMENT_ID } from "@/lib/teams"

type TableStandingsProps = {
  tableData: LeagueTableResponse | null
  fixture: LiveFixture
  isLoading?: boolean
}

function ClubCrest({ src, name }: { src?: string; name: string }) {
  const [failed, setFailed] = useState(false)

  if (!src || failed) {
    return (
      <span className="size-6 sm:size-7 rounded-full bg-white/10 border border-white/15 flex items-center justify-center font-bold text-[10px] text-white/70 shrink-0 select-none">
        {name.slice(0, 2).toUpperCase()}
      </span>
    )
  }

  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={src}
      alt={name}
      width={28}
      height={28}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="size-6 sm:size-7 object-contain shrink-0 drop-shadow-xs select-none"
    />
  )
}

function QualificationIndicator({ color }: { color?: "blue" | "orange" | "green" | "red" | null }) {
  if (!color) {
    return <span className="w-1 h-5 shrink-0 invisible" aria-hidden="true" />
  }

  const colorStyles = {
    blue: "bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]",
    orange: "bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.6)]",
    green: "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]",
    red: "bg-rose-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]",
  }

  return (
    <span
      className={`w-1 h-5 rounded-full shrink-0 ${colorStyles[color]}`}
      aria-hidden="true"
    />
  )
}

export function TableStandings({ tableData, fixture, isLoading }: TableStandingsProps) {
  if (isLoading) {
    return (
      <div className="h-64 flex flex-col items-center justify-center gap-3 bg-neutral-950/70 rounded-2xl border border-white/10">
        <div className="size-8 rounded-full border-2 border-white/10 border-t-[var(--pitch)] animate-spin" />
        <span className="text-xs text-muted-foreground font-mono">LOADING LEAGUE STANDINGS...</span>
      </div>
    )
  }

  if (!tableData?.rows || tableData.rows.length === 0) {
    return (
      <div className="p-8 text-center bg-neutral-950/40 rounded-2xl border border-white/10 flex flex-col items-center gap-2">
        <TrophyIcon className="size-8 text-white/20 mb-1" />
        <h4 className="text-sm font-bold text-white/80">STANDINGS NOT AVAILABLE</h4>
        <p className="text-xs text-muted-foreground max-w-sm">
          League table data could not be retrieved for this competition.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Table Header / League Title */}
      <header className="flex items-center justify-between px-3.5 py-2.5 bg-neutral-900/80 rounded-xl border border-white/10 text-xs">
        <div className="flex items-center gap-2 font-bold text-white/90">
          {/* The real competition crest, keyed off our own fixture.league
              rather than the provider's label, which is not guaranteed to
              match. The trophy stays as the fallback for a competition we do
              not carry a tournament id for. */}
          {LEAGUE_TOURNAMENT_ID[fixture.league] ? (
            <LeagueCrest
              tournamentId={LEAGUE_TOURNAMENT_ID[fixture.league]}
              name={fixture.league}
              size={18}
            />
          ) : (
            <TrophyIcon className="size-4 text-[var(--pitch)]" />
          )}
          <span>{tableData.leagueName}</span>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground font-mono">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-[var(--pitch)]" />
            <span className="text-white/80 font-medium">{fixture.home}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-sky-400" />
            <span className="text-white/80 font-medium">{fixture.away}</span>
          </span>
        </div>
      </header>

      {/* Standings Table Card */}
      <div className="overflow-x-auto rounded-2xl border border-white/10 bg-neutral-950/90 shadow-2xl">
        <table className="w-full text-left text-xs min-w-[580px] border-collapse" role="table">
          <caption className="sr-only">{tableData.leagueName} Standings Table</caption>
          <thead>
            <tr className="border-b border-white/10 bg-white/[0.02] text-[11px] font-semibold text-neutral-400 select-none">
              <th scope="col" className="py-3 pl-3 pr-1 w-10 text-center">#</th>
              <th scope="col" className="py-3 px-2 text-left">Team</th>
              <th scope="col" className="py-3 px-2 text-right w-10">P</th>
              <th scope="col" className="py-3 px-2 text-right w-12">GD</th>
              <th scope="col" className="py-3 px-2 text-right w-12 font-bold text-neutral-200">PTS</th>
              <th scope="col" className="py-3 px-2 text-right w-10">W</th>
              <th scope="col" className="py-3 px-2 text-right w-10">D</th>
              <th scope="col" className="py-3 px-2 text-right w-10">L</th>
              <th scope="col" className="py-3 px-2 text-right w-10">F</th>
              <th scope="col" className="py-3 pl-2 pr-4 text-right w-10">A</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.03]">
            {tableData.rows.map((row) => {
              const isMatchTeam = row.isHome || row.isAway

              return (
                <tr
                  key={`table-${row.rank}-${row.team}`}
                  className={`group transition-colors ${
                    row.isHome
                      ? "bg-[var(--pitch)]/10 hover:bg-[var(--pitch)]/15"
                      : row.isAway
                      ? "bg-sky-500/10 hover:bg-sky-500/15"
                      : "hover:bg-white/[0.03]"
                  }`}
                >
                  {/* Rank with Qualification Indicator */}
                  <td className="py-2.5 pl-2 pr-1 text-center font-mono">
                    <div className="flex items-center gap-1.5 justify-center">
                      <QualificationIndicator color={row.qualificationColor} />
                      <span className="text-neutral-400 text-xs font-medium w-5 text-center">
                        {row.rank}
                      </span>
                    </div>
                  </td>

                  {/* Club: Crest + Name + Live Dot + Badges */}
                  <td className="py-2.5 px-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <ClubCrest src={row.crest} name={row.team} />

                      <span
                        className={`truncate font-semibold tracking-tight text-xs sm:text-sm ${
                          isMatchTeam ? "text-white font-bold" : "text-white/90 group-hover:text-white"
                        }`}
                      >
                        {row.team}
                      </span>

                      {/* Live Indicator (Orange Dot like LiveScore) */}
                      {row.isLive && (
                        <span
                          className="inline-block size-2 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.9)] motion-safe:animate-pulse shrink-0 ml-0.5"
                          title="Match currently in progress"
                        />
                      )}

                      {/* Active Match Home/Away Badges */}
                      {row.isHome && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-[var(--pitch)] text-black shrink-0 ml-1">
                          HOME
                        </span>
                      )}
                      {row.isAway && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-sky-400 text-black shrink-0 ml-1">
                          AWAY
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Played */}
                  <td className="py-2.5 px-2 text-right font-mono text-neutral-300 text-xs sm:text-sm">
                    {row.played}
                  </td>

                  {/* Goal Difference */}
                  <td
                    className={`py-2.5 px-2 text-right font-mono text-xs sm:text-sm ${
                      row.goalDiff > 0
                        ? "text-neutral-200"
                        : row.goalDiff < 0
                        ? "text-neutral-400"
                        : "text-neutral-400"
                    }`}
                  >
                    {row.goalDiff}
                  </td>

                  {/* Points (PTS) - Bold White Highlighted Column */}
                  <td
                    className={`py-2.5 px-2 text-right font-mono font-bold text-xs sm:text-sm ${
                      isMatchTeam ? "text-[var(--pitch)] font-black" : "text-white"
                    }`}
                  >
                    {row.points}
                  </td>

                  {/* Won */}
                  <td className="py-2.5 px-2 text-right font-mono text-neutral-400 text-xs sm:text-sm">
                    {row.won}
                  </td>

                  {/* Drawn */}
                  <td className="py-2.5 px-2 text-right font-mono text-neutral-400 text-xs sm:text-sm">
                    {row.drawn}
                  </td>

                  {/* Lost */}
                  <td className="py-2.5 px-2 text-right font-mono text-neutral-400 text-xs sm:text-sm">
                    {row.lost}
                  </td>

                  {/* Goals For */}
                  <td className="py-2.5 px-2 text-right font-mono text-neutral-400 text-xs sm:text-sm">
                    {row.goalsFor}
                  </td>

                  {/* Goals Against */}
                  <td className="py-2.5 pl-2 pr-4 text-right font-mono text-neutral-400 text-xs sm:text-sm">
                    {row.goalsAgainst}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Qualification Legend Footer */}
      <footer className="flex flex-wrap items-center gap-4 px-3 py-2 text-[11px] text-muted-foreground bg-neutral-900/40 rounded-xl border border-white/5">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-1.5 h-3.5 rounded-full bg-blue-500" />
          <span>Champions League</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-1.5 h-3.5 rounded-full bg-orange-500" />
          <span>Europa League</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-1.5 h-3.5 rounded-full bg-emerald-500" />
          <span>Conference League</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-1.5 h-3.5 rounded-full bg-rose-500" />
          <span>Relegation</span>
        </span>
      </footer>
    </div>
  )
}
