"use client"

import type { LiveFixture } from "@/components/live-sections"
import type { MatchSummaryResponse } from "@/app/api/livescores/summary/route"
import {
  MapPinIcon,
  UsersIcon,
  UserCheckIcon,
  CalendarIcon,
  TrophyIcon,
  ClockIcon,
} from "lucide-react"

export type MatchInfoProps = {
  summaryData: MatchSummaryResponse | null
  fixture: LiveFixture
  isLoading?: boolean
}

export function MatchInfo({ summaryData, fixture, isLoading }: MatchInfoProps) {
  if (isLoading) {
    return (
      <div className="py-14 flex flex-col items-center justify-center gap-3 text-white/50">
        <div className="size-8 rounded-full border-2 border-emerald-500/20 border-t-emerald-500 animate-spin" />
        <span className="text-xs font-medium tracking-wide">Loading match info...</span>
      </div>
    )
  }

  const matchInfo = summaryData?.matchInfo
  const venue = matchInfo?.venue
  const referee = matchInfo?.referee

  return (
    <div className="space-y-5">
      {/* MATCH INFO Section Header */}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-white/50 mb-3">
          Match Info
        </h3>

        <div className="divide-y divide-white/5 rounded-xl bg-neutral-900/60 border border-white/10 overflow-hidden text-xs sm:text-sm">
          {/* Referee */}
          {referee?.name ? (
            <div className="flex items-center gap-3.5 p-3.5 sm:p-4 hover:bg-white/[0.02] transition-colors">
              <div className="size-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0 text-white/70">
                <UserCheckIcon className="size-4.5 text-[var(--pitch)]" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[11px] font-semibold text-white/40 uppercase tracking-wide">Referee</span>
                <span className="font-bold text-white/95">
                  {referee.name}
                  {referee.country && <span className="text-white/45 font-normal ml-1.5">({referee.country})</span>}
                </span>
              </div>
            </div>
          ) : null}

          {/* Stadium / Venue */}
          {venue?.name ? (
            <div className="flex items-center gap-3.5 p-3.5 sm:p-4 hover:bg-white/[0.02] transition-colors">
              <div className="size-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0 text-white/70">
                <MapPinIcon className="size-4.5 text-sky-400" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[11px] font-semibold text-white/40 uppercase tracking-wide">Venue</span>
                <span className="font-bold text-white/95">{venue.name}</span>
                {venue.city && (
                  <span className="text-xs text-white/50">
                    {venue.city}
                    {venue.country ? `, ${venue.country}` : ""}
                  </span>
                )}
              </div>
            </div>
          ) : null}

          {/* Attendance / Capacity */}
          {venue?.capacity ? (
            <div className="flex items-center gap-3.5 p-3.5 sm:p-4 hover:bg-white/[0.02] transition-colors">
              <div className="size-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0 text-white/70">
                <UsersIcon className="size-4.5 text-amber-400" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[11px] font-semibold text-white/40 uppercase tracking-wide">Capacity</span>
                <span className="font-mono font-bold text-white/95">
                  {venue.capacity.toLocaleString()} spectators
                </span>
              </div>
            </div>
          ) : null}

          {/* Competition & Round */}
          {(matchInfo?.competition || matchInfo?.round || fixture.league) && (
            <div className="flex items-center gap-3.5 p-3.5 sm:p-4 hover:bg-white/[0.02] transition-colors">
              <div className="size-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0 text-white/70">
                <TrophyIcon className="size-4.5 text-yellow-400" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[11px] font-semibold text-white/40 uppercase tracking-wide">Competition</span>
                <span className="font-bold text-white/95">
                  {matchInfo?.competition || fixture.league}
                </span>
                {matchInfo?.round && (
                  <span className="text-xs text-white/50">{matchInfo.round}</span>
                )}
              </div>
            </div>
          )}

          {/* Kick-off / Status */}
          <div className="flex items-center gap-3.5 p-3.5 sm:p-4 hover:bg-white/[0.02] transition-colors">
            <div className="size-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0 text-white/70">
              <ClockIcon className="size-4.5 text-emerald-400" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[11px] font-semibold text-white/40 uppercase tracking-wide">Match Status</span>
              <span className="font-bold text-white/95">
                {matchInfo?.status || fixture.status}
              </span>
              {fixture.kickoff && (
                <span className="text-xs text-white/50">
                  Kick-off: {fixture.kickoff}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
