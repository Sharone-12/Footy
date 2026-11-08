"use client"

import { useState } from "react"
import { PlayerAvatar, TeamCrest } from "@/components/player-avatar"
import type { MatchLineupsResponse, LineupPlayer } from "@/app/api/livescores/lineups/route"
import type { LiveFixture } from "@/components/live-sections"
import { UsersIcon, ShieldIcon, SparklesIcon } from "lucide-react"

type PitchLineupProps = {
  lineups: MatchLineupsResponse | null
  fixture: LiveFixture
  isLoading?: boolean
}

/**
 * Where a row sits, as a percentage of the box it is drawn in.
 *
 * Rows used to run a hardcoded 8% -> 68%. In the both-teams view each half is
 * only half the pitch tall, so a 4-2-3-1 got five rows into ~156px — about
 * 39px a gap — while a node stands ~62px tall. Every label landed on the next
 * row's heads. Widening the span and shrinking the node is what fixes it.
 */
function rowPercent(row: number, maxRow: number, near: number, far: number): number {
  if (row <= 1) return near
  const fraction = maxRow > 1 ? (row - 1) / (maxRow - 1) : 0.5
  return near + fraction * (far - near)
}

function PlayerNode({
  player,
  teamColor = "var(--pitch)",
  isAway = false,
  size = 40,
}: {
  player: LineupPlayer
  teamColor?: string
  isAway?: boolean
  /** Avatar diameter. Smaller when both teams share the pitch. */
  size?: number
}) {
  const ring = isAway ? "#38bdf8" : teamColor
  return (
    // The coordinate is the avatar's centre, not the centre of avatar-plus-
    // label: the box is exactly the avatar, and the name hangs off it
    // absolutely so it can never shift the avatar or widen the node.
    <div
      className="relative -translate-x-1/2 -translate-y-1/2 group cursor-pointer z-10 transition-transform hover:scale-110 hover:z-30"
      style={{ width: size, height: size }}
    >
      {player.playerId ? (
        <PlayerAvatar playerId={player.playerId} name={player.name} size={size} ring={ring} />
      ) : (
        <div
          className="rounded-full flex items-center justify-center font-bold text-[11px] select-none shadow-md border-2"
          style={{
            width: size,
            height: size,
            backgroundColor: isAway ? "#0f172a" : "#022c22",
            borderColor: ring,
            color: "#ffffff",
          }}
        >
          {player.jerseyNumber ?? player.name.slice(0, 2).toUpperCase()}
        </div>
      )}

      {/* Number sits inside the label rather than as a badge over the avatar,
          which is both cleaner and one less thing to collide. */}
      <span className="absolute top-full left-1/2 -translate-x-1/2 mt-1 flex items-center gap-1 whitespace-nowrap max-w-[68px] sm:max-w-[94px] rounded bg-black/85 px-1 sm:px-1.5 py-0.5 text-[9px] sm:text-[10px] font-semibold text-white/95 shadow backdrop-blur-xs border border-white/10 group-hover:border-[var(--pitch)] transition-colors">
        {player.jerseyNumber !== null && (
          <span className="font-mono tabular-nums" style={{ color: ring }}>
            {player.jerseyNumber}
          </span>
        )}
        <span className="truncate">{player.shortName || player.name}</span>
      </span>
    </div>
  )
}

export function PitchLineup({ lineups, fixture, isLoading }: PitchLineupProps) {
  const [viewMode, setViewMode] = useState<"both" | "home" | "away">("both")

  if (isLoading) {
    return (
      <div className="h-96 flex flex-col items-center justify-center gap-3 bg-neutral-950/50 rounded-2xl border border-white/10">
        <div className="size-8 rounded-full border-2 border-white/10 border-t-[var(--pitch)] animate-spin" />
        <span className="text-xs text-muted-foreground font-mono">LOADING LINE-UPS & FORMATIONS...</span>
      </div>
    )
  }

  if (!lineups?.hasLineups) {
    return (
      <div className="p-8 text-center bg-neutral-950/40 rounded-2xl border border-white/10 flex flex-col items-center gap-2">
        <UsersIcon className="size-8 text-white/20 mb-1" />
        <h4 className="text-sm font-bold text-white/80">LINE-UPS NOT YET ANNOUNCED</h4>
        <p className="text-xs text-muted-foreground max-w-sm">
          Official starting formations and squads will automatically sync as soon as they are submitted prior to kickoff.
        </p>
      </div>
    )
  }

  const { homeFormation, awayFormation, homeStarting, awayStarting, homeSubs, awaySubs } = lineups

  const homeMaxRow = Math.max(2, ...homeStarting.map((p) => p.row))
  const awayMaxRow = Math.max(2, ...awayStarting.map((p) => p.row))

  return (
    <div className="flex flex-col gap-4">
      {/* Header Bar: Formations & View Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 bg-neutral-900/80 rounded-xl border border-white/10 text-xs">
        {/* Formations Badge */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 font-bold">
            {fixture.home_id && <TeamCrest teamId={fixture.home_id} name={fixture.home} size={18} />}
            <span className="text-white/90">{fixture.home}</span>
            {homeFormation && (
              <span className="px-1.5 py-0.5 rounded bg-[var(--pitch)]/20 text-[var(--pitch)] font-mono text-[10px] font-bold border border-[var(--pitch)]/30">
                {homeFormation}
              </span>
            )}
          </div>
          <span className="text-white/30 font-bold select-none">vs</span>
          <div className="flex items-center gap-1.5 font-bold">
            {awayFormation && (
              <span className="px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-400 font-mono text-[10px] font-bold border border-sky-500/30">
                {awayFormation}
              </span>
            )}
            <span className="text-white/90">{fixture.away}</span>
            {fixture.away_id && <TeamCrest teamId={fixture.away_id} name={fixture.away} size={18} />}
          </div>
        </div>

        {/* View Switcher Pills */}
        <div className="flex items-center p-0.5 bg-black/60 rounded-lg border border-white/10">
          <button
            type="button"
            onClick={() => setViewMode("both")}
            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
              viewMode === "both" ? "bg-[var(--pitch)] text-black font-bold shadow-xs" : "text-white/60 hover:text-white"
            }`}
          >
            Full Pitch
          </button>
          <button
            type="button"
            onClick={() => setViewMode("home")}
            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
              viewMode === "home" ? "bg-[var(--pitch)] text-black font-bold shadow-xs" : "text-white/60 hover:text-white"
            }`}
          >
            {fixture.home}
          </button>
          <button
            type="button"
            onClick={() => setViewMode("away")}
            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
              viewMode === "away" ? "bg-sky-500 text-black font-bold shadow-xs" : "text-white/60 hover:text-white"
            }`}
          >
            {fixture.away}
          </button>
        </div>
      </div>

      {/* The Football Pitch Graphic */}
      <div className="relative w-full aspect-[4/5] sm:aspect-[3/4] min-h-[680px] sm:min-h-[740px] max-h-[860px] rounded-2xl overflow-hidden border border-emerald-900/60 shadow-inner select-none bg-radial from-[#155e38] via-[#0d4a2b] to-[#08301c]">
        {/* Grass Stripes Pattern */}
        <div className="absolute inset-0 bg-[repeating-linear-gradient(0deg,rgba(0,0,0,0.06)_0px,rgba(0,0,0,0.06)_32px,transparent_32px,transparent_64px)] pointer-events-none" />

        {/* Pitch Boundary & Lines */}
        <div className="absolute inset-3 border-2 border-white/30 rounded-lg pointer-events-none">
          {/* Halfway Line */}
          <div className="absolute top-1/2 inset-x-0 h-0.5 bg-white/30 -translate-y-1/2" />
          {/* Center Circle */}
          <div className="absolute top-1/2 left-1/2 size-28 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/30 flex items-center justify-center">
            <div className="size-2 rounded-full bg-white/40" />
          </div>

          {/* Top Penalty Box (Away) */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-24 border-x-2 border-b-2 border-white/30">
            {/* Goal Area */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-10 border-x-2 border-b-2 border-white/30" />
          </div>

          {/* Bottom Penalty Box (Home) */}
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-48 h-24 border-x-2 border-t-2 border-white/30">
            {/* Goal Area */}
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-24 h-10 border-x-2 border-t-2 border-white/30" />
          </div>
        </div>

        {/* FULL PITCH: Away Top Half, Home Bottom Half */}
        {viewMode === "both" && (
          <>
            {/* Away Team (Top Half, facing down) */}
            <div className="absolute inset-x-0 top-0 h-1/2 p-3 sm:p-4">
              {awayStarting.map((player, idx) => {
                const top = rowPercent(player.row, awayMaxRow, 8, 70)
                const totalInRow = player.totalInRow || 1
                const colPercent = (player.col / (totalInRow + 1)) * 100

                return (
                  <div
                    key={`away-${player.name}-${idx}`}
                    className="absolute"
                    style={{ top: `${top}%`, left: `${colPercent}%` }}
                  >
                    <PlayerNode player={player} isAway size={awayMaxRow >= 5 ? 28 : 32} />
                  </div>
                )
              })}
            </div>

            {/* Home Team (Bottom Half, facing up) */}
            <div className="absolute inset-x-0 bottom-0 h-1/2 p-3 sm:p-4 pb-4">
              {homeStarting.map((player, idx) => {
                const bottom = rowPercent(player.row, homeMaxRow, 8, 70)
                const totalInRow = player.totalInRow || 1
                const colPercent = (player.col / (totalInRow + 1)) * 100

                return (
                  <div
                    key={`home-${player.name}-${idx}`}
                    className="absolute"
                    style={{ bottom: `${bottom}%`, left: `${colPercent}%` }}
                  >
                    <PlayerNode player={player} size={homeMaxRow >= 5 ? 28 : 32} />
                  </div>
                )
              })}
            </div>
          </>
        )}

        {/* SINGLE TEAM: Home Team Only */}
        {viewMode === "home" && (
          <div className="absolute inset-0 p-6 pb-10">
            {homeStarting.map((player, idx) => {
              const bottom = rowPercent(player.row, homeMaxRow, 9, 88)
              const totalInRow = player.totalInRow || 1
              const colPercent = (player.col / (totalInRow + 1)) * 100

              return (
                <div
                  key={`single-home-${player.name}-${idx}`}
                  className="absolute"
                  style={{ bottom: `${bottom}%`, left: `${colPercent}%` }}
                >
                  <PlayerNode player={player} />
                </div>
              )
            })}
          </div>
        )}

        {/* SINGLE TEAM: Away Team Only */}
        {viewMode === "away" && (
          <div className="absolute inset-0 p-6 pb-10">
            {awayStarting.map((player, idx) => {
              const top = rowPercent(player.row, awayMaxRow, 9, 88)
              const totalInRow = player.totalInRow || 1
              const colPercent = (player.col / (totalInRow + 1)) * 100

              return (
                <div
                  key={`single-away-${player.name}-${idx}`}
                  className="absolute"
                  style={{ top: `${top}%`, left: `${colPercent}%` }}
                >
                  <PlayerNode player={player} isAway />
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Substitutes Bench Lists */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
        {/* Home Substitutes */}
        <div className="p-3 bg-neutral-900/60 rounded-xl border border-white/10">
          <div className="flex items-center gap-1.5 mb-2.5 pb-2 border-b border-white/10 text-xs font-bold text-white/90">
            {fixture.home_id && <TeamCrest teamId={fixture.home_id} name={fixture.home} size={16} />}
            <span>{fixture.home} Substitutes</span>
            <span className="text-white/40 text-[10px] ml-auto">({homeSubs.length})</span>
          </div>

          <div className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
            {homeSubs.map((sub, i) => (
              <div key={`h-sub-${i}`} className="flex items-center gap-2 p-1.5 rounded-lg bg-black/40 border border-white/5 text-xs">
                {sub.playerId ? (
                  <PlayerAvatar playerId={sub.playerId} name={sub.name} size={28} />
                ) : (
                  <span className="size-7 rounded-full bg-white/10 font-bold text-[10px] flex items-center justify-center text-white/70">
                    {sub.jerseyNumber ?? "SUB"}
                  </span>
                )}
                <div className="flex flex-col min-w-0">
                  <span className="font-semibold text-white/90 truncate text-[11px]">{sub.shortName || sub.name}</span>
                  <span className="text-[10px] text-white/40 font-mono">#{sub.jerseyNumber ?? "-"} · {sub.positionName}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Away Substitutes */}
        <div className="p-3 bg-neutral-900/60 rounded-xl border border-white/10">
          <div className="flex items-center gap-1.5 mb-2.5 pb-2 border-b border-white/10 text-xs font-bold text-white/90">
            {fixture.away_id && <TeamCrest teamId={fixture.away_id} name={fixture.away} size={16} />}
            <span>{fixture.away} Substitutes</span>
            <span className="text-white/40 text-[10px] ml-auto">({awaySubs.length})</span>
          </div>

          <div className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
            {awaySubs.map((sub, i) => (
              <div key={`a-sub-${i}`} className="flex items-center gap-2 p-1.5 rounded-lg bg-black/40 border border-white/5 text-xs">
                {sub.playerId ? (
                  <PlayerAvatar playerId={sub.playerId} name={sub.name} size={28} ring="#38bdf8" />
                ) : (
                  <span className="size-7 rounded-full bg-sky-950 font-bold text-[10px] flex items-center justify-center text-sky-400">
                    {sub.jerseyNumber ?? "SUB"}
                  </span>
                )}
                <div className="flex flex-col min-w-0">
                  <span className="font-semibold text-white/90 truncate text-[11px]">{sub.shortName || sub.name}</span>
                  <span className="text-[10px] text-white/40 font-mono">#{sub.jerseyNumber ?? "-"} · {sub.positionName}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

