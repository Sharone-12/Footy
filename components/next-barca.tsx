"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { TeamCrest, LeagueCrest } from "@/components/player-avatar"
import { BARCA_ID, LEAGUE_TOURNAMENT_ID } from "@/lib/teams"

export type NextBarcaMatch = {
  event_id: number
  kickoff: string | null
  date: string
  league: string
  opponent: string
  opponent_id: number | null
  home: boolean
}

// A kickoff stays "next" for two hours so the pill reads KICK OFF through the
// match instead of jumping to the following fixture at the whistle.
const PLAYING_MS = 2 * 60 * 60 * 1000

// Without a kickoff time all we know is the day, so count to the end of it.
const startOf = (m: NextBarcaMatch) =>
  new Date(m.kickoff ?? `${m.date}T23:59:59Z`).getTime()

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

  useEffect(() => {
    const tick = () => setNow(Date.now())
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [])

  const match = pick(matches, now ?? 0) ?? matches[0]
  if (!match) return null

  const tid = LEAGUE_TOURNAMENT_ID[match.league]
  const left = now == null ? null : startOf(match) - now
  const t = left == null ? null : parts(Math.max(left, 0))

  return (
    <Link
      href={`/predictions/match?id=${match.event_id}`}
      className="pointer-events-auto nav-pill flex items-center gap-2 pl-2 pr-3 py-1.5"
      title={`${match.league} — Barça ${match.home ? "vs" : "away at"} ${match.opponent}`}
    >
      <span className="flex items-center gap-1">
        <TeamCrest teamId={BARCA_ID} name="FC Barcelona" size={20} />
        <span className="stat-label text-[0.6rem] leading-none">v</span>
        {match.opponent_id != null && (
          <TeamCrest teamId={match.opponent_id} name={match.opponent} size={20} />
        )}
      </span>
      <span className="flex flex-col leading-none">
        <span className="stat-label text-[0.55rem] leading-none">
          {match.home ? "vs" : "at"} {match.opponent}
        </span>
        <span
          className="stat-figure text-[0.95rem] mt-0.5"
          style={{ color: "var(--pitch)" }}
        >
          {!t ? (
            <span className="opacity-40">--:--:--</span>
          ) : left! <= 0 ? (
            "KICK OFF"
          ) : !match.kickoff ? (
            `${t.d}d`
          ) : t.d > 0 ? (
            `${t.d}d ${pad(t.h)}:${pad(t.m)}:${pad(t.s)}`
          ) : (
            `${pad(t.h)}:${pad(t.m)}:${pad(t.s)}`
          )}
        </span>
      </span>
      {tid && <LeagueCrest tournamentId={tid} name={match.league} size={18} />}
    </Link>
  )
}
