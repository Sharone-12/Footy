"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { TeamCrest, LeagueCrest } from "@/components/player-avatar"
import { BARCA_ID, LEAGUE_TOURNAMENT_ID } from "@/lib/teams"
// A kickoff stays "next" through the match, so the pill reads KICK OFF
// instead of jumping to the following fixture at the whistle.
import { PLAYING_MS, startOf } from "@/lib/live"
import { LiveSignal } from "@/components/live-signal"
import { TeamPicker } from "@/components/team-picker"
import {
  PREFERRED_TEAM_EVENT,
  readPreferredTeam,
  type PreferredTeam,
} from "@/lib/preferred-team"

export type NextBarcaMatch = {
  event_id: number
  kickoff: string | null
  date: string
  league: string
  opponent: string
  opponent_id: number | null
  home: boolean
}

function pick(matches: NextBarcaMatch[], now: number) {
  return matches.find((m) => startOf(m) + PLAYING_MS > now) ?? null
}

function parts(ms: number) {
  const s = Math.floor(ms / 1000)
  return {
    d: Math.floor(s / 86400),
    h: Math.floor((s % 86400) / 3600),
    m: Math.floor((s % 3600) / 60),
    s: s % 60,
  }
}

const pad = (n: number) => String(n).padStart(2, "0")

export function NextBarca({ matches }: { matches: NextBarcaMatch[] }) {
  // Starts null and fills on mount: the server has no live clock to pick a
  // fixture with, and rendering a different second would break hydration.
  const [now, setNow] = useState<number | null>(null)

  // Same reason this starts null rather than reading storage during render:
  // the server cannot see localStorage, so the first client render has to
  // match the Barça markup it sent, then swap on the effect below.
  const [pref, setPref] = useState<PreferredTeam | null>(null)
  // Keyed by team id so a response that arrives after another switch is
  // ignored, and so clearing needs no synchronous setState in the effect.
  const [override, setOverride] = useState<{
    id: number
    matches: NextBarcaMatch[]
  } | null>(null)

  useEffect(() => {
    const tick = () => setNow(Date.now())
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [])

  // Picking a club in the dialog fires the event, so the pill updates
  // immediately instead of waiting for a navigation. `storage` covers the
  // same choice made in another tab.
  useEffect(() => {
    const sync = () => setPref(readPreferredTeam())
    sync()
    window.addEventListener(PREFERRED_TEAM_EVENT, sync)
    window.addEventListener("storage", sync)
    return () => {
      window.removeEventListener(PREFERRED_TEAM_EVENT, sync)
      window.removeEventListener("storage", sync)
    }
  }, [])

  // Barça needs no request: the layout already rendered those fixtures.
  useEffect(() => {
    if (!pref || pref.id === BARCA_ID) return
    const id = pref.id
    let alive = true
    fetch(`/api/teams?team_id=${id}`)
      .then((r) => (r.ok ? r.json() : { matches: [] }))
      .then((j: { matches?: NextBarcaMatch[] }) => {
        if (alive) setOverride({ id, matches: j.matches ?? [] })
      })
      .catch(() => {
        // Resolve to empty rather than leaving it pending: a stuck spinner
        // is worse than "no fixture", and the pencil stays reachable.
        if (alive) setOverride({ id, matches: [] })
      })
    return () => {
      alive = false
    }
  }, [pref])

  const following = pref ?? { id: BARCA_ID, name: "FC Barcelona" }
  const isBarca = following.id === BARCA_ID
  // Only trust an override that belongs to the club now followed.
  const source = isBarca
    ? matches
    : override?.id === following.id
      ? override.matches
      : null
  const waiting = source == null

  const match = source ? (pick(source, now ?? 0) ?? source[0] ?? null) : null

  // Barça with no fixtures at all is the original "render nothing" case. For
  // a chosen club the shell stays, or the pencil disappears with it and
  // there is no way back to another team.
  if (!match && isBarca && !waiting) return null

  const tid = match ? LEAGUE_TOURNAMENT_ID[match.league] : undefined
  const left = match && now != null ? startOf(match) - now : null
  const t = left == null ? null : parts(Math.max(left, 0))
  const isLive = left != null && left <= 0

  const label = match
    ? isLive
      ? `LIVE NOW: ${following.name} ${match.home ? "vs" : "at"} ${match.opponent} — Click to Watch`
      : `${match.league} — ${following.name} ${match.home ? "vs" : "away at"} ${match.opponent}`
    : `${following.name} — no upcoming fixture`

  const body = (
    <>
      <span className="flex items-center gap-0.5 sm:gap-1 shrink-0">
        <TeamCrest teamId={following.id} name={following.name} size={18} />
        {match && (
          <>
            <span className="stat-label text-[0.55rem] sm:text-[0.6rem] leading-none">v</span>
            {match.opponent_id != null && (
              <TeamCrest teamId={match.opponent_id} name={match.opponent} size={18} />
            )}
          </>
        )}
      </span>
      <span className="flex flex-col leading-none min-w-0">
        <span className="hidden sm:inline stat-label text-[0.55rem] leading-none truncate max-w-[6.5rem]">
          {match ? `${match.home ? "vs" : "at"} ${match.opponent}` : following.name}
        </span>
        <span
          className="stat-figure text-[0.85rem] sm:text-[0.95rem] mt-0.5"
          style={{ color: "var(--pitch)" }}
        >
          {waiting ? (
            <span className="opacity-40">--:--:--</span>
          ) : !match ? (
            <span className="opacity-40 text-[0.7rem]">No fixture</span>
          ) : !t ? (
            <span className="opacity-40">--:--:--</span>
          ) : isLive ? (
            <span className="inline-flex items-center gap-1.5 font-bold">
              <LiveSignal size={12} />
              <span>LIVE</span>
            </span>
          ) : !match.kickoff ? (
            `${t.d}d`
          ) : t.d > 0 ? (
            `${t.d}d ${pad(t.h)}:${pad(t.m)}:${pad(t.s)}`
          ) : (
            `${pad(t.h)}:${pad(t.m)}:${pad(t.s)}`
          )}
        </span>
      </span>
      {tid && match && (
        <LeagueCrest
          tournamentId={tid}
          name={match.league}
          size={18}
          variant="transparent"
          className="hidden sm:inline-block shrink-0"
        />
      )}
    </>
  )

  return (
    <span
      className={`pointer-events-auto nav-pill flex items-center gap-1 sm:gap-1.5 pl-2 pr-1.5 sm:pr-2 py-1 sm:py-1.5 shrink-0 transition-all ${
        isLive ? "border-[var(--pitch)]/60 shadow-[0_0_12px_-4px_var(--pitch)]" : ""
      }`}
      title={label}
    >
      {match ? (
        <Link
          href={
            isLive
              ? `/live/watch?id=${match.event_id}`
              : `/predictions/match?id=${match.event_id}`
          }
          className="flex items-center gap-1.5 sm:gap-2 min-w-0"
        >
          {body}
        </Link>
      ) : (
        <span className="flex items-center gap-1.5 sm:gap-2 min-w-0">{body}</span>
      )}
      <TeamPicker current={pref} />
    </span>
  )
}
