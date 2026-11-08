"use client"

import type { LiveFixture } from "@/components/live-sections"
import type { MatchIncident, MatchSummaryResponse } from "@/app/api/livescores/summary/route"
import { TeamCrest } from "@/components/player-avatar"
import {
  ActivityIcon,
  ShieldAlertIcon,
  MapPinIcon,
  UsersIcon,
  UserCheckIcon,
  AlertTriangleIcon,
} from "lucide-react"

export type MatchSummaryProps = {
  summaryData: MatchSummaryResponse | null
  fixture: LiveFixture
  isLoading?: boolean
}

function IncidentIcon({ type }: { type: MatchIncident["type"] }) {
  switch (type) {
    case "goal":
      return (
        <span
          className="inline-flex items-center justify-center size-6 rounded-full bg-emerald-500/20 text-emerald-400 text-xs shadow-xs"
          title="Goal"
        >
          ⚽
        </span>
      )
    case "penalty":
      return (
        <span
          className="inline-flex items-center justify-center size-6 rounded-full bg-emerald-500/25 text-emerald-300 text-xs font-bold shadow-xs"
          title="Penalty Goal"
        >
          ⚽
        </span>
      )
    case "own-goal":
      return (
        <span
          className="inline-flex items-center justify-center size-6 rounded-full bg-rose-500/20 text-rose-400 text-xs shadow-xs"
          title="Own Goal"
        >
          ⚽
        </span>
      )
    case "yellow-card":
      return (
        <span
          className="inline-block w-3.5 h-4.5 rounded-[2px] bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.4)]"
          title="Yellow Card"
        />
      )
    case "second-yellow":
      return (
        <div className="relative inline-flex items-center" title="Second Yellow Card (Red)">
          <span className="w-3 h-4 rounded-[2px] bg-amber-400 shadow-xs -mr-1.5" />
          <span className="w-3 h-4 rounded-[2px] bg-rose-600 shadow-xs z-10" />
        </div>
      )
    case "red-card":
      return (
        <span
          className="inline-block w-3.5 h-4.5 rounded-[2px] bg-rose-600 shadow-[0_0_8px_rgba(225,29,72,0.5)]"
          title="Red Card"
        />
      )
    case "disallowed-goal":
      return (
        <span
          className="inline-flex items-center justify-center size-6 rounded-full bg-neutral-800 text-rose-400 border border-rose-500/40 text-xs"
          title="Disallowed Goal (VAR)"
        >
          🚫
        </span>
      )
    default:
      return null
  }
}

function IncidentCard({
  incident,
  isHome,
}: {
  incident: MatchIncident
  isHome: boolean
}) {
  const isGoal = incident.type === "goal" || incident.type === "penalty" || incident.type === "own-goal"
  const isRed = incident.type === "red-card" || incident.type === "second-yellow"
  const isDisallowed = incident.type === "disallowed-goal"

  return (
    <div
      className={`flex items-start gap-2.5 max-w-[280px] sm:max-w-[340px] ${
        isHome ? "flex-row sm:flex-row-reverse text-left sm:text-right" : "flex-row text-left"
      }`}
    >
      <div className="mt-0.5 shrink-0">
        <IncidentIcon type={incident.type} />
      </div>

      <div className="flex flex-col min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className={`font-semibold text-xs sm:text-sm truncate ${
              isRed
                ? "text-rose-400 font-bold"
                : isGoal
                  ? "text-white font-bold"
                  : isDisallowed
                    ? "text-neutral-400 line-through"
                    : "text-white/90"
            }`}
          >
            {incident.player}
          </span>

          {incident.type === "penalty" && (
            <span className="text-[10px] px-1 py-0.2 rounded font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              PEN
            </span>
          )}

          {incident.type === "own-goal" && (
            <span className="text-[10px] px-1 py-0.2 rounded font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
              OG
            </span>
          )}

          {incident.type === "disallowed-goal" && (
            <span className="text-[10px] px-1 py-0.2 rounded font-bold bg-rose-950/60 text-rose-400 border border-rose-500/40">
              VAR NO GOAL
            </span>
          )}
        </div>

        {incident.assist && (
          <span className="text-[11px] text-white/45 truncate">
            Assist: {incident.assist}
          </span>
        )}

        {incident.varReason && !incident.type.includes("disallowed") && (
          <span className="text-[10px] text-amber-400/80 italic">
            {incident.varReason.replace("VAR:", "VAR: ").replace(/_/g, " ")}
          </span>
        )}

        {incident.score && (
          <div className="mt-0.5">
            <span className="inline-block px-1.5 py-0.5 rounded bg-white/10 text-white/90 font-mono text-[10px] font-bold">
              {incident.score[0]} - {incident.score[1]}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

export function MatchSummary({ summaryData, fixture, isLoading }: MatchSummaryProps) {
  if (isLoading) {
    return (
      <div className="py-14 flex flex-col items-center justify-center gap-3 text-white/50">
        <div className="size-8 rounded-full border-2 border-emerald-500/20 border-t-emerald-500 animate-spin" />
        <span className="text-xs font-medium tracking-wide">Loading match timeline...</span>
      </div>
    )
  }

  const incidents = summaryData?.incidents || []
  const matchInfo = summaryData?.matchInfo
  const scores = summaryData?.scores

  // Split incidents by half
  const half1Incidents = incidents.filter((i) => i.half === 1)
  const half2Incidents = incidents.filter((i) => i.half === 2)
  const extraIncidents = incidents.filter((i) => i.half > 2)

  const hasEvents = incidents.length > 0

  return (
    <div className="space-y-6">
      {/* Match Quick Header Bar */}
      <div className="p-3 sm:p-4 rounded-xl bg-neutral-900/60 border border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          {fixture.home_id && <TeamCrest teamId={fixture.home_id} name={fixture.home} size={20} />}
          <span className="font-bold text-white/95">{fixture.home}</span>
          <span className="text-white/40">vs</span>
          <span className="font-bold text-white/95">{fixture.away}</span>
          {fixture.away_id && <TeamCrest teamId={fixture.away_id} name={fixture.away} size={20} />}
        </div>

        {matchInfo?.round && (
          <span className="text-white/50 font-medium">
            {matchInfo.stage ? `${matchInfo.stage} · ` : ""}{matchInfo.round}
          </span>
        )}
      </div>

      {/* Empty State */}
      {!hasEvents && (
        <div className="py-14 px-4 text-center surface rounded-xl bg-card border border-border/50 flex flex-col items-center gap-3">
          <div className="size-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/40">
            <ActivityIcon className="size-6" />
          </div>
          <div className="max-w-md">
            <h4 className="text-sm font-bold text-white/90 mb-1">No Match Events Yet</h4>
            <p className="text-xs text-white/50 leading-relaxed">
              Goals, cards, and key milestones will appear here in chronological order as the match takes place.
            </p>
          </div>
        </div>
      )}

      {/* Chronological Timeline */}
      {hasEvents && (
        <div className="relative">
          {/* Vertical Center Spine for Large Screens */}
          <div className="hidden sm:block absolute top-4 bottom-4 left-1/2 -translate-x-1/2 w-0.5 bg-white/10 pointer-events-none" />

          {/* First Half Incidents */}
          <div className="space-y-4">
            <div className="flex items-center justify-center my-2">
              <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] font-bold text-white/70 uppercase tracking-wider">
                1st Half
              </span>
            </div>

            {half1Incidents.length === 0 ? (
              <div className="text-center py-2 text-xs text-white/30 italic">No events in 1st half</div>
            ) : (
              half1Incidents.map((incident) => {
                const isHome = incident.team === "home"
                return (
                  <div
                    key={incident.id}
                    className="relative flex items-center justify-between sm:justify-center gap-4 py-1.5"
                  >
                    {/* Home Side Event (Desktop Left) */}
                    <div className="flex-1 hidden sm:flex justify-end pr-5">
                      {isHome ? <IncidentCard incident={incident} isHome={true} /> : null}
                    </div>

                    {/* Minute Circle Badge */}
                    <div className="relative z-10 shrink-0 size-8 sm:size-9 rounded-full bg-neutral-900 border-2 border-white/20 flex items-center justify-center shadow-md">
                      <span className="font-mono text-[10px] sm:text-[11px] font-bold text-white/90">
                        {incident.minDisplay}
                      </span>
                    </div>

                    {/* Away Side Event (Desktop Right) */}
                    <div className="flex-1 hidden sm:flex justify-start pl-5">
                      {!isHome ? <IncidentCard incident={incident} isHome={false} /> : null}
                    </div>

                    {/* Mobile View: Single Column */}
                    <div className="flex-1 sm:hidden flex items-center gap-2 pl-2">
                      <span className="text-[10px] uppercase font-bold text-white/40">
                        {isHome ? fixture.home.slice(0, 3) : fixture.away.slice(0, 3)}
                      </span>
                      <IncidentCard incident={incident} isHome={false} />
                    </div>
                  </div>
                )
              })
            )}

            {/* Half-Time Divider */}
            <div className="flex items-center justify-center py-3">
              <div className="px-4 py-1.5 rounded-xl bg-neutral-900/90 border border-white/15 shadow-sm flex items-center gap-2.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-white/60">
                  Half Time
                </span>
                {scores?.ht && (
                  <span className="px-2 py-0.5 rounded bg-[var(--pitch)]/20 text-[var(--pitch)] font-mono text-xs font-bold border border-[var(--pitch)]/30">
                    {scores.ht[0]} - {scores.ht[1]}
                  </span>
                )}
              </div>
            </div>

            {/* Second Half Incidents */}
            <div className="flex items-center justify-center my-2">
              <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] font-bold text-white/70 uppercase tracking-wider">
                2nd Half
              </span>
            </div>

            {half2Incidents.length === 0 ? (
              <div className="text-center py-2 text-xs text-white/30 italic">No events in 2nd half</div>
            ) : (
              half2Incidents.map((incident) => {
                const isHome = incident.team === "home"
                return (
                  <div
                    key={incident.id}
                    className="relative flex items-center justify-between sm:justify-center gap-4 py-1.5"
                  >
                    {/* Home Side Event (Desktop Left) */}
                    <div className="flex-1 hidden sm:flex justify-end pr-5">
                      {isHome ? <IncidentCard incident={incident} isHome={true} /> : null}
                    </div>

                    {/* Minute Circle Badge */}
                    <div className="relative z-10 shrink-0 size-8 sm:size-9 rounded-full bg-neutral-900 border-2 border-white/20 flex items-center justify-center shadow-md">
                      <span className="font-mono text-[10px] sm:text-[11px] font-bold text-white/90">
                        {incident.minDisplay}
                      </span>
                    </div>

                    {/* Away Side Event (Desktop Right) */}
                    <div className="flex-1 hidden sm:flex justify-start pl-5">
                      {!isHome ? <IncidentCard incident={incident} isHome={false} /> : null}
                    </div>

                    {/* Mobile View: Single Column */}
                    <div className="flex-1 sm:hidden flex items-center gap-2 pl-2">
                      <span className="text-[10px] uppercase font-bold text-white/40">
                        {isHome ? fixture.home.slice(0, 3) : fixture.away.slice(0, 3)}
                      </span>
                      <IncidentCard incident={incident} isHome={false} />
                    </div>
                  </div>
                )
              })
            )}

            {/* Extra Time Incidents (if any) */}
            {extraIncidents.length > 0 && (
              <>
                <div className="flex items-center justify-center my-2">
                  <span className="px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-[11px] font-bold text-amber-400 uppercase tracking-wider">
                    Extra Time
                  </span>
                </div>
                {extraIncidents.map((incident) => {
                  const isHome = incident.team === "home"
                  return (
                    <div
                      key={incident.id}
                      className="relative flex items-center justify-between sm:justify-center gap-4 py-1.5"
                    >
                      <div className="flex-1 hidden sm:flex justify-end pr-5">
                        {isHome ? <IncidentCard incident={incident} isHome={true} /> : null}
                      </div>
                      <div className="relative z-10 shrink-0 size-8 sm:size-9 rounded-full bg-neutral-900 border-2 border-white/20 flex items-center justify-center shadow-md">
                        <span className="font-mono text-[10px] sm:text-[11px] font-bold text-white/90">
                          {incident.minDisplay}
                        </span>
                      </div>
                      <div className="flex-1 hidden sm:flex justify-start pl-5">
                        {!isHome ? <IncidentCard incident={incident} isHome={false} /> : null}
                      </div>
                      <div className="flex-1 sm:hidden flex items-center gap-2 pl-2">
                        <span className="text-[10px] uppercase font-bold text-white/40">
                          {isHome ? fixture.home.slice(0, 3) : fixture.away.slice(0, 3)}
                        </span>
                        <IncidentCard incident={incident} isHome={false} />
                      </div>
                    </div>
                  )
                })}
              </>
            )}

            {/* Full-Time Divider */}
            {(summaryData?.status === "FT" || summaryData?.status === "AET" || summaryData?.status === "AP") && (
              <div className="flex items-center justify-center py-4">
                <div className="px-5 py-2 rounded-xl bg-neutral-900 border border-[var(--pitch)]/40 shadow-[0_0_15px_rgba(34,197,94,0.15)] flex items-center gap-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-white">
                    Full Time
                  </span>
                  {scores?.ft && (
                    <span className="px-2.5 py-0.5 rounded bg-[var(--pitch)] text-black font-mono text-xs font-extrabold shadow-sm">
                      {scores.ft[0]} - {scores.ft[1]}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer Info Summary Pill */}
      {(matchInfo?.venue || matchInfo?.referee) && (
        <div className="pt-2 border-t border-white/10 flex flex-wrap items-center justify-center gap-4 text-xs text-white/60">
          {matchInfo.referee?.name && (
            <div className="flex items-center gap-1.5">
              <UserCheckIcon className="size-3.5 text-white/40" />
              <span>Referee: <strong className="text-white/90">{matchInfo.referee.name}</strong></span>
              {matchInfo.referee.country && <span className="text-white/40">({matchInfo.referee.country})</span>}
            </div>
          )}

          {matchInfo.venue?.name && (
            <div className="flex items-center gap-1.5">
              <MapPinIcon className="size-3.5 text-white/40" />
              <span>Venue: <strong className="text-white/90">{matchInfo.venue.name}</strong></span>
              {matchInfo.venue.city && <span className="text-white/40">({matchInfo.venue.city})</span>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
