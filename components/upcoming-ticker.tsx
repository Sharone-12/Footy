"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { TeamCrest, LeagueCrest, preloadImage } from "@/components/player-avatar"
import { LEAGUE_TOURNAMENT_ID, TOP_10_FIFA_NATION_IDS, isPredictable } from "@/lib/teams"
import { teamImage, teamImageFallback, leagueImage } from "@/lib/images"
import { formatDateIST } from "@/lib/time"

export type UpcomingMatch = {
  event_id: number
  date: string
  league: string
  home: string
  home_id: number | null
  away: string
  away_id: number | null
}

function formatWhen(iso: string) {
  return formatDateIST(`${iso}T12:00:00Z`)
}

const SLOT_MS = 4000

/** A link when there is somewhere to go, a plain card otherwise. */
function Card({
  href,
  className,
  children,
}: {
  href?: string
  className: string
  children: React.ReactNode
}) {
  return href ? (
    <Link href={href} className={className}>
      {children}
    </Link>
  ) : (
    <div className={className}>{children}</div>
  )
}

export function UpcomingTicker({ matches }: { matches: UpcomingMatch[] }) {
  const [i, setI] = useState(0)
  const [paused, setPaused] = useState(false)

  // Preload team crests & tournament logos for all matches so sliding is instantaneous
  useEffect(() => {
    if (!matches || matches.length === 0) return
    for (const m of matches) {
      if (m.home_id) {
        const isNat = TOP_10_FIFA_NATION_IDS.has(Number(m.home_id))
        preloadImage(isNat ? teamImageFallback(m.home_id) : teamImage(m.home_id))
        if (!isNat) preloadImage(teamImageFallback(m.home_id))
      }
      if (m.away_id) {
        const isNat = TOP_10_FIFA_NATION_IDS.has(Number(m.away_id))
        preloadImage(isNat ? teamImageFallback(m.away_id) : teamImage(m.away_id))
        if (!isNat) preloadImage(teamImageFallback(m.away_id))
      }
      const tid = LEAGUE_TOURNAMENT_ID[m.league]
      if (tid) {
        preloadImage(leagueImage(tid))
      }
    }
  }, [matches])

  useEffect(() => {
    if (matches.length <= 1 || paused) return
    const t = setInterval(() => setI((x) => (x + 1) % matches.length), SLOT_MS)
    return () => clearInterval(t)
  }, [matches.length, paused])

  if (matches.length === 0) {
    return (
      <section className="surface rounded-2xl bg-card px-6 py-5 h-[230px] flex items-center justify-center">
        <span className="stat-label">No upcoming matches.</span>
      </section>
    )
  }

  const m = matches[i]
  const tid = LEAGUE_TOURNAMENT_ID[m.league]
  const isBarca = m.home === "FC Barcelona" || m.away === "FC Barcelona"

  return (
    <section
      className={`surface rounded-2xl overflow-hidden ${
        isBarca
          ? "barca-stripes text-white"
          : "bg-card border border-border/70 shadow-sm"
      }`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <header className="flex items-center justify-between px-6 pt-5 pb-2">
        <h2
          className="text-lg font-semibold tracking-tight uppercase"
          style={{ fontFamily: "var(--font-condensed)" }}
        >
          Upcoming
        </h2>
        <div className="flex items-center gap-2">
          <span className={`stat-label text-xs tabular-nums ${isBarca ? "!text-white/80" : ""}`}>
            {i + 1} / {matches.length}
          </span>
          <div className="flex items-center gap-0.5 ml-1">
            <button
              type="button"
              aria-label="Previous match"
              onClick={() =>
                setI((x) => (x - 1 + matches.length) % matches.length)
              }
              className={`inline-flex items-center justify-center size-6 rounded-full transition-colors ${
                isBarca
                  ? "text-white/80 hover:text-white hover:bg-white/15"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              <ChevronLeftIcon className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Next match"
              onClick={() => setI((x) => (x + 1) % matches.length)}
              className={`inline-flex items-center justify-center size-6 rounded-full transition-colors ${
                isBarca
                  ? "text-white/80 hover:text-white hover:bg-white/15"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              <ChevronRightIcon className="size-4" />
            </button>
          </div>
        </div>
      </header>
      <div className="px-3 pb-4 h-[170px]">
        {/* An international has no prediction page to open, so that card is
            shown rather than linked. */}
        <Card
          key={m.event_id}
          href={isPredictable(m.league) ? `/predictions/match?id=${m.event_id}` : undefined}
          className="card-lift animate-in fade-in slide-in-from-right-3 duration-500 flex flex-col justify-center gap-3 px-4 py-4 rounded-xl h-full"
        >
          <div className="flex items-center justify-between gap-3">
            <span className={`stat-label text-xs ${isBarca ? "!text-white/80" : ""}`}>{formatWhen(m.date)}</span>
            {tid && <LeagueCrest tournamentId={tid} name={m.league} size={20} priority />}
          </div>
          <div className="flex items-center gap-4">
            <div className="flex-1 min-w-0 flex items-center gap-2.5">
              {m.home_id != null && (
                <TeamCrest teamId={m.home_id} name={m.home} size={32} priority />
              )}
              <span className={`truncate font-semibold text-[0.95rem] ${isBarca ? "text-white" : "text-foreground"}`}>{m.home}</span>
            </div>
            <span
              className="stat-figure text-xl shrink-0"
              style={{ color: "var(--pitch)" }}
            >
              vs
            </span>
            <div className="flex-1 min-w-0 flex items-center gap-2.5 justify-end text-right">
              <span className={`truncate font-semibold text-[0.95rem] ${isBarca ? "text-white" : "text-foreground"}`}>{m.away}</span>
              {m.away_id != null && (
                <TeamCrest teamId={m.away_id} name={m.away} size={32} priority />
              )}
            </div>
          </div>
        </Card>
      </div>
    </section>
  )
}
