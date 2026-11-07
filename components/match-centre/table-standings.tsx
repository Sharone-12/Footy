"use client"

import type { LeagueTableResponse, TableRow } from "@/app/api/livescores/table/route"
import type { LiveFixture } from "@/components/live-sections"
import { TeamCrest } from "@/components/player-avatar"
import { TrophyIcon } from "lucide-react"

type TableStandingsProps = {
  tableData: LeagueTableResponse | null
  fixture: LiveFixture
  isLoading?: boolean
}

export function TableStandings({ tableData, fixture, isLoading }: TableStandingsProps) {
  if (isLoading) {
    return (
      <div className="h-64 flex flex-col items-center justify-center gap-3 bg-neutral-950/50 rounded-2xl border border-white/10">
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
      <div className="flex items-center justify-between px-3 py-2 bg-neutral-900/80 rounded-xl border border-white/10 text-xs">
        <div className="flex items-center gap-2 font-bold text-white/90">
          <TrophyIcon className="size-4 text-[var(--pitch)]" />
          <span>{tableData.leagueName}</span>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-[var(--pitch)]" />
            <span className="text-white/80 font-medium">{fixture.home}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-sky-400" />
            <span className="text-white/80 font-medium">{fixture.away}</span>
          </span>
        </div>
      </div>

      {/* Standings Table */}
      <div className="overflow-x-auto rounded-xl border border-white/10 bg-neutral-950/60">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-white/10 bg-white/[0.02] text-[11px] font-bold text-muted-foreground select-none">
              <th className="py-2.5 pl-3 pr-2 w-10 text-center">#</th>
              <th className="py-2.5 px-3 font-semibold">Club</th>
              <th className="py-2.5 px-2 text-center w-10">P</th>
              <th className="py-2.5 px-2 text-center w-10 hidden sm:table-cell">W</th>
              <th className="py-2.5 px-2 text-center w-10 hidden sm:table-cell">D</th>
              <th className="py-2.5 px-2 text-center w-10 hidden sm:table-cell">L</th>
              <th className="py-2.5 px-2 text-center w-12 hidden md:table-cell">GD</th>
              <th className="py-2.5 pl-2 pr-4 text-right w-14 font-black text-white">PTS</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {tableData.rows.map((row) => {
              const isHighlight = row.isHome || row.isAway
              return (
                <tr
                  key={`table-${row.rank}-${row.team}`}
                  className={`transition-colors font-medium ${
                    row.isHome
                      ? "bg-[var(--pitch)]/10 hover:bg-[var(--pitch)]/15 border-l-4 border-l-[var(--pitch)] font-bold"
                      : row.isAway
                      ? "bg-sky-500/10 hover:bg-sky-500/15 border-l-4 border-l-sky-400 font-bold"
                      : "hover:bg-white/[0.02] text-white/80"
                  }`}
                >
                  {/* Rank */}
                  <td className="py-2.5 pl-3 pr-2 text-center font-mono">
                    <span
                      className={`inline-flex items-center justify-center size-6 rounded-md font-bold text-xs ${
                        row.rank <= 4
                          ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                          : row.rank <= 6
                          ? "bg-sky-500/20 text-sky-400 border border-sky-500/30"
                          : row.rank >= tableData.rows.length - 2
                          ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                          : "text-white/60"
                      }`}
                    >
                      {row.rank}
                    </span>
                  </td>

                  {/* Club */}
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-2.5">
                      {row.crest ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={row.crest}
                          alt=""
                          width={20}
                          height={20}
                          className="size-5 object-contain shrink-0 rounded-xs"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="size-5 rounded-full bg-white/10 shrink-0" />
                      )}
                      <span className={`truncate ${isHighlight ? "text-white font-bold" : "text-white/90"}`}>
                        {row.team}
                      </span>

                      {row.isHome && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-[var(--pitch)] text-black ml-1 shrink-0">
                          HOME
                        </span>
                      )}
                      {row.isAway && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-sky-400 text-black ml-1 shrink-0">
                          AWAY
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Played */}
                  <td className="py-2.5 px-2 text-center font-mono text-white/70">{row.played}</td>

                  {/* Won */}
                  <td className="py-2.5 px-2 text-center font-mono text-white/60 hidden sm:table-cell">{row.won}</td>

                  {/* Drawn */}
                  <td className="py-2.5 px-2 text-center font-mono text-white/60 hidden sm:table-cell">{row.drawn}</td>

                  {/* Lost */}
                  <td className="py-2.5 px-2 text-center font-mono text-white/60 hidden sm:table-cell">{row.lost}</td>

                  {/* Goal Diff */}
                  <td className={`py-2.5 px-2 text-center font-mono hidden md:table-cell ${
                    row.goalDiff > 0 ? "text-emerald-400 font-bold" : row.goalDiff < 0 ? "text-rose-400" : "text-white/60"
                  }`}>
                    {row.goalDiff > 0 ? `+${row.goalDiff}` : row.goalDiff}
                  </td>

                  {/* Points */}
                  <td className={`py-2.5 pl-2 pr-4 text-right font-mono font-black text-sm ${
                    isHighlight ? "text-[var(--pitch)]" : "text-white"
                  }`}>
                    {row.points}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
