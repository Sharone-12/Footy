"use client"

import Link from "next/link"
import { PlayIcon } from "lucide-react"
import { useLiveScore, useLiveNow, useHasLiveStream } from "@/components/live-score"
import { matchClock, type FixtureLike } from "@/lib/livescores"
import { TeamCrest, LeagueCrest } from "@/components/player-avatar"
import { LEAGUE_ABBR, LEAGUE_TOURNAMENT_ID } from "@/lib/teams"
import { formatDateIST } from "@/lib/time"
import type { MatchPrediction } from "@/lib/predictions"

const OUTCOME_COLORS = {
  home: "oklch(0.80 0.19 150)",
  draw: "oklch(0.70 0.045 252)",
  away: "oklch(0.72 0.14 40)",
} as const

const OUTCOME_LABELS = { home: "Home", draw: "Draw", away: "Away" } as const

function ProbBar({ homeWin, draw, awayWin }: { homeWin: number; draw: number; awayWin: number }) {
  return (
    <div className="flex h-2 rounded-full overflow-hidden gap-px">
      <div
        className="rounded-l-full transition-all"
        style={{ width: `${homeWin}%`, background: OUTCOME_COLORS.home }}
      />
      <div
        className="transition-all"
        style={{ width: `${draw}%`, background: OUTCOME_COLORS.draw }}
      />
      <div
        className="rounded-r-full transition-all"
        style={{ width: `${awayWin}%`, background: OUTCOME_COLORS.away }}
      />
    </div>
  )
}

/**
 * Match Prediction Card used across the `/predictions` tab.
 * Displays real-time live scoreline, live ticking badge, probability distribution,
 * and a "Watch Now" button when an active live stream exists.
 */
export function PredictionMatchCard({ p }: { p: MatchPrediction }) {
  const isSettled = p.actual !== null
  const isBarca = p.home === "FC Barcelona" || p.away === "FC Barcelona"

  // Live score, clock and stream telemetry
  const liveScore = useLiveScore({
    home: p.home,
    away: p.away,
    date: p.date,
    kickoff: p.kickoff,
  })
  const now = useLiveNow()
  const clock = liveScore ? matchClock(liveScore, now) : null
  const isLive = liveScore != null
  const hasLiveStream = useHasLiveStream(p.event_id)

  const start = p.kickoff ? new Date(p.kickoff).getTime() : new Date(`${p.date}T23:59:59Z`).getTime()
  const isWithin15Min = start - now <= 15 * 60_000 && now - start < 2 * 60 * 60 * 1000
  const showWatchNow = hasLiveStream && (isLive || isWithin15Min)

  const tournamentId = LEAGUE_TOURNAMENT_ID[p.league]

  return (
    <div
      className={`card-lift surface rounded-2xl p-4 space-y-3.5 flex flex-col justify-between transition-all border border-border/70 shadow-sm ${
        isBarca ? "barca-stripes" : "bg-card"
      }`}
    >
      {/* Top Header: League, Round, Live Badge or Date */}
      <div className="flex items-center justify-between gap-2">
        <div className="shrink-0 flex items-center gap-1.5 min-w-0">
          {tournamentId ? (
            <LeagueCrest tournamentId={tournamentId} name={p.league} size={20} />
          ) : (
            <span className="stat-label text-xs font-semibold">{LEAGUE_ABBR[p.league] ?? p.league}</span>
          )}
          <span className="stat-label text-xs">R{p.round}</span>
        </div>

        {isLive ? (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[var(--pitch)]/15 border border-[var(--pitch)]/35 text-[var(--pitch)] shrink-0 shadow-sm">
            <span className="relative flex size-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--pitch)] opacity-75 motion-reduce:hidden" />
              <span className="relative inline-flex rounded-full size-1.5 bg-[var(--pitch)]" />
            </span>
            <span className="font-mono font-bold text-[0.68rem] tracking-wider uppercase tabular-nums">
              LIVE • {clock?.display ?? "IN PLAY"}
            </span>
          </div>
        ) : (
          <span className="stat-label text-xs ml-auto">
            {formatDateIST(`${p.date}T12:00:00Z`)}
          </span>
        )}
      </div>

      {/* Main Teams & Scoreline Block — Clickable to match details */}
      <Link
        href={`/predictions/match?id=${p.event_id}`}
        className="grid grid-cols-[1fr_auto_1fr] items-center gap-2.5 py-1 group transition-colors"
      >
        {/* Home Team */}
        <span className="flex items-center gap-2 justify-end min-w-0">
          <span className="text-[0.92rem] font-semibold truncate group-hover:text-[var(--pitch)] transition-colors">
            {p.home}
          </span>
          {p.home_id && <TeamCrest teamId={p.home_id} name={p.home} size={24} className="shrink-0" />}
        </span>

        {/* Scoreline Hub: Live Score, Settled Score, or VS */}
        <span className="px-2 flex flex-col items-center justify-center min-w-[56px] shrink-0">
          {isSettled ? (
            <span className="font-mono font-black text-lg tabular-nums text-foreground">
              {p.homeGoals} &ndash; {p.awayGoals}
            </span>
          ) : isLive ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-xl bg-black/60 border border-[var(--pitch)]/40 shadow-inner">
              <span className="font-mono font-black text-base text-[var(--pitch)] tabular-nums tracking-tight">
                {liveScore.homeGoals ?? 0}&ndash;{liveScore.awayGoals ?? 0}
              </span>
            </span>
          ) : (
            <span className="stat-label text-xs font-semibold px-2">vs</span>
          )}
        </span>

        {/* Away Team */}
        <span className="flex items-center gap-2 min-w-0">
          {p.away_id && <TeamCrest teamId={p.away_id} name={p.away} size={24} className="shrink-0" />}
          <span className="text-[0.92rem] font-semibold truncate group-hover:text-[var(--pitch)] transition-colors">
            {p.away}
          </span>
        </span>
      </Link>

      {/* Probability Bar */}
      <div className="space-y-1.5">
        <ProbBar homeWin={p.homeWin} draw={p.draw} awayWin={p.awayWin} />
        <div className="flex justify-between text-xs">
          {(["home", "draw", "away"] as const).map((k) => (
            <span key={k} className="flex items-center gap-1.5">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: OUTCOME_COLORS[k] }}
              />
              <span className="stat-label text-[0.7rem]">
                {OUTCOME_LABELS[k]}{" "}
                <span className="text-foreground font-medium tabular-nums">
                  {k === "home" ? p.homeWin : k === "draw" ? p.draw : p.awayWin}%
                </span>
              </span>
            </span>
          ))}
        </div>
      </div>

      {/* Bottom Footer: Predicted Outcome & Watch Now CTA */}
      <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-white/10">
        <div className="text-xs">
          <span className="stat-label text-[0.75rem]">Pred: </span>
          <span className="font-semibold" style={{ color: OUTCOME_COLORS[p.predicted] }}>
            {p.predicted === "home" ? p.home : p.predicted === "away" ? p.away : "Draw"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {isSettled && (
            <span
              className="stat-label text-[0.62rem] font-bold px-2 py-0.5 rounded-full"
              style={{
                color: p.correct ? OUTCOME_COLORS.home : "oklch(0.65 0.14 25)",
                background: p.correct
                  ? "oklch(0.80 0.19 150 / 13%)"
                  : "oklch(0.65 0.14 25 / 13%)",
              }}
            >
              {p.correct ? "CORRECT" : "WRONG"}
            </span>
          )}

          {/* Watch Now Button: Highlighted when stream is currently live or within 15 mins of kickoff */}
          {showWatchNow && (
            <Link
              href={`/live/watch?id=${p.event_id}`}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-[var(--pitch)] text-black hover:brightness-110 font-bold text-xs shadow-md transition-all hover:scale-[1.03] shrink-0"
              title={`Watch live stream for ${p.home} vs ${p.away}`}
            >
              <PlayIcon className="size-3 fill-current" />
              Watch Now
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Scoreboard component for the match prediction hero banner on `/predictions/match`.
 * Renders settled score, live score + clock, or 'vs'.
 */
export function MatchHeroScoreboard({
  fixture,
  isSettled,
  homeGoals,
  awayGoals,
}: {
  fixture: FixtureLike
  isSettled: boolean
  homeGoals: number | null
  awayGoals: number | null
}) {
  const liveScore = useLiveScore(fixture)
  const now = useLiveNow()
  const clock = liveScore ? matchClock(liveScore, now) : null

  if (isSettled) {
    return (
      <div className="stat-figure text-3xl px-3 font-mono font-black tabular-nums">
        {homeGoals} &ndash; {awayGoals}
      </div>
    )
  }

  if (liveScore) {
    return (
      <div className="flex flex-col items-center justify-center gap-1.5 px-3">
        <div className="font-mono font-black text-3xl sm:text-4xl tabular-nums text-foreground tracking-tight">
          {liveScore.homeGoals ?? 0} &ndash; {liveScore.awayGoals ?? 0}
        </div>
        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[var(--pitch)]/15 border border-[var(--pitch)]/35 text-[var(--pitch)] font-mono font-bold text-[0.7rem] tracking-wider uppercase">
          <span className="relative flex size-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--pitch)] opacity-75 motion-reduce:hidden" />
            <span className="relative inline-flex rounded-full size-1.5 bg-[var(--pitch)]" />
          </span>
          <span>LIVE • {clock?.display ?? "IN PLAY"}</span>
        </div>
      </div>
    )
  }

  return <div className="stat-label text-lg px-3">vs</div>
}

/**
 * Live badge pill for `/predictions/match` header.
 * Only appears when the match is actively in play.
 */
export function MatchLiveBadge({ fixture }: { fixture: FixtureLike }) {
  const liveScore = useLiveScore(fixture)
  const now = useLiveNow()
  if (!liveScore) return null
  const clock = matchClock(liveScore, now)

  return (
    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--pitch)]/15 border border-[var(--pitch)]/35 text-[var(--pitch)] text-xs font-bold font-mono shadow-sm">
      <span className="relative flex size-1.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--pitch)] opacity-75 motion-reduce:hidden" />
        <span className="relative inline-flex rounded-full size-1.5 bg-[var(--pitch)]" />
      </span>
      <span>LIVE • {clock.display}</span>
    </div>
  )
}

/**
 * Watch Live Stream CTA button on `/predictions/match`.
 * Renders a prominent button if an active confirmed stream is available.
 */
export function MatchWatchStreamCTA({
  eventId,
  home,
  away,
}: {
  eventId: number
  home: string
  away: string
}) {
  const hasLiveStream = useHasLiveStream(eventId)
  if (!hasLiveStream) return null

  return (
    <div className="mt-5 flex justify-center animate-fade-in">
      <Link
        href={`/live/watch?id=${eventId}`}
        className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[var(--pitch)] text-black hover:brightness-110 font-bold text-sm shadow-lg transition-all hover:scale-[1.02]"
        title={`Watch live stream for ${home} vs ${away}`}
      >
        <PlayIcon className="size-4 fill-current" />
        Watch Live Stream
      </Link>
    </div>
  )
}
