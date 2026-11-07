"use client"

import type { H2HResponse } from "@/app/api/livescores/h2h/route"
import type { LiveFixture } from "@/components/live-sections"
import { TeamCrest } from "@/components/player-avatar"
import { HistoryIcon, SwordsIcon } from "lucide-react"

type H2HHistoryProps = {
  h2hData: H2HResponse | null
  fixture: LiveFixture
  isLoading?: boolean
}

function FormBadge({ result }: { result: string }) {
  const r = result.toUpperCase()
  let bg = "bg-neutral-800 text-white/60 border-neutral-700"
  if (r === "W") bg = "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
  else if (r === "D") bg = "bg-amber-500/20 text-amber-400 border-amber-500/40"
  else if (r === "L") bg = "bg-rose-500/20 text-rose-400 border-rose-500/40"

  return (
    <span
      className={`size-6 rounded-md font-mono font-black text-xs flex items-center justify-center border ${bg} select-none shadow-xs`}
      title={r === "W" ? "Win" : r === "D" ? "Draw" : "Loss"}
    >
      {r}
    </span>
  )
}

export function H2HHistory({ h2hData, fixture, isLoading }: H2HHistoryProps) {
  if (isLoading) {
    return (
      <div className="h-64 flex flex-col items-center justify-center gap-3 bg-neutral-950/50 rounded-2xl border border-white/10">
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

  // Calculate H2H aggregate record
  let homeWins = 0
  let draws = 0
  let awayWins = 0

  for (const m of h2hData.matches) {
    if (m.winner === "draw") draws++
    else if (m.home === fixture.home && m.winner === "home") homeWins++
    else if (m.away === fixture.home && m.winner === "away") homeWins++
    else awayWins++
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 1. Aggregate Stats Banner & Recent Form */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3.5 bg-neutral-900/80 rounded-xl border border-white/10">
        {/* Home Form */}
        <div className="flex flex-col items-start gap-1.5">
          <div className="flex items-center gap-1.5 text-xs font-bold text-white/90">
            {fixture.home_id && <TeamCrest teamId={fixture.home_id} name={fixture.home} size={16} />}
            <span className="truncate">{fixture.home}</span>
          </div>
          <div className="flex items-center gap-1">
            {h2hData.homeForm.length > 0 ? (
              h2hData.homeForm.map((f, i) => <FormBadge key={`hf-${i}`} result={f} />)
            ) : (
              <span className="text-[11px] text-white/40">No recent form data</span>
            )}
          </div>
        </div>

        {/* H2H Breakdown */}
        <div className="flex flex-col items-center justify-center gap-1 border-y md:border-y-0 md:border-x border-white/10 py-2 md:py-0">
          <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider">H2H Historical Record</span>
          <div className="flex items-center gap-3 font-mono font-bold text-xs">
            <span className="text-[var(--pitch)]">{homeWins} W</span>
            <span className="text-white/30">·</span>
            <span className="text-amber-400">{draws} D</span>
            <span className="text-white/30">·</span>
            <span className="text-sky-400">{awayWins} W</span>
          </div>
        </div>

        {/* Away Form */}
        <div className="flex flex-col items-start md:items-end gap-1.5">
          <div className="flex items-center gap-1.5 text-xs font-bold text-white/90">
            <span className="truncate">{fixture.away}</span>
            {fixture.away_id && <TeamCrest teamId={fixture.away_id} name={fixture.away} size={16} />}
          </div>
          <div className="flex items-center gap-1">
            {h2hData.awayForm.length > 0 ? (
              h2hData.awayForm.map((f, i) => <FormBadge key={`af-${i}`} result={f} />)
            ) : (
              <span className="text-[11px] text-white/40">No recent form data</span>
            )}
          </div>
        </div>
      </div>

      {/* 2. Previous Meetings List */}
      <div className="flex flex-col gap-2">
        <h4 className="text-xs font-bold text-white/50 uppercase tracking-wider px-1">Recent Head-to-Head Encounters</h4>
        <div className="flex flex-col divide-y divide-white/[0.04] rounded-xl border border-white/10 bg-neutral-950/60 overflow-hidden">
          {h2hData.matches.map((match, i) => (
            <div
              key={`h2h-match-${i}`}
              className="flex items-center justify-between p-3 hover:bg-white/[0.02] transition-colors text-xs"
            >
              {/* Competition & Date */}
              <div className="flex flex-col min-w-0 w-32 sm:w-44">
                <span className="font-semibold text-white/80 truncate text-[11px]">{match.league}</span>
                <span className="text-[10px] font-mono text-white/40">{match.date}</span>
              </div>

              {/* Match Scoreline */}
              <div className="flex items-center justify-center gap-3 flex-1 px-2">
                <span className={`text-right truncate flex-1 ${
                  match.winner === "home" ? "font-bold text-white" : "text-white/70"
                }`}>
                  {match.home}
                </span>

                <span className="px-2.5 py-1 rounded-md bg-neutral-900 border border-white/10 font-mono font-bold text-xs text-white tabular-nums tracking-wider shrink-0 shadow-xs">
                  {match.homeScore} - {match.awayScore}
                </span>

                <span className={`text-left truncate flex-1 ${
                  match.winner === "away" ? "font-bold text-white" : "text-white/70"
                }`}>
                  {match.away}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
