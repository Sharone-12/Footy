"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ExpandIcon, SearchIcon, XIcon } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { TeamCrest, LeagueCrest } from "@/components/player-avatar"
import { LEAGUE_ABBR, LEAGUE_TOURNAMENT_ID } from "@/lib/teams"

/**
 * One row of any ranked team list. Every figure arrives already formatted:
 * this is a client component, so a server page cannot hand it a formatter.
 */
export type RankedTeamRow = {
  team: string
  league: string
  /** Omit for a club we hold no page for — the row renders unlinked. */
  href?: string
  /** The big right-hand figure, e.g. "92.4" or "+0.85". */
  rating: string
  /** Colour for that figure. Podium green for the top three when omitted. */
  ratingTone?: string
  /** Small right-aligned columns, each with a label beneath. */
  cols?: { value: string; label: string; tone?: string }[]
  /** Shown beneath the team name in place of the league line. */
  meta?: string
}

export function TeamRankingsExpand({
  rows,
  teamIds,
  title = "Power Rankings",
  subtitle,
}: {
  rows: RankedTeamRow[]
  teamIds: Map<string, number>
  title?: string
  subtitle?: string
}) {
  const [q, setQ] = useState("")

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter(
      (r) =>
        r.team.toLowerCase().includes(needle) ||
        r.league.toLowerCase().includes(needle),
    )
  }, [q, rows])

  return (
    <Dialog>
      <DialogTrigger
        aria-label={`Expand ${title}`}
        className="inline-flex items-center justify-center size-6 rounded-full text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
      >
        <ExpandIcon className="size-4" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-4 border-b border-white/5 pr-14">
          <DialogTitle
            className="text-xl font-semibold tracking-tight uppercase leading-tight"
            style={{ fontFamily: "var(--font-condensed)" }}
          >
            {title}
          </DialogTitle>
          <span className="stat-label mt-1 block">
            {subtitle ?? `${rows.length} teams · ppg + goal diff + xG`}
          </span>
          <div className="relative mt-4">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            <Input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search team or league…"
              className="pl-9 pr-9 h-9"
            />
            {q && (
              <button
                type="button"
                aria-label="Clear"
                onClick={() => setQ("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center size-6 rounded-full text-muted-foreground hover:text-foreground hover:bg-white/[0.06]"
              >
                <XIcon className="size-3.5" />
              </button>
            )}
          </div>
        </DialogHeader>
        <div className="max-h-[65vh] overflow-y-auto px-2 py-2">
          {filtered.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              No teams match.
            </p>
          ) : (
            filtered.map((t) => {
              const absoluteRank = rows.indexOf(t) + 1
              const tid = LEAGUE_TOURNAMENT_ID[t.league]
              const className = `row-item flex items-center gap-3 px-3 py-2.5 rounded-xl ${
                t.team === "FC Barcelona" ? "barca-stripes" : ""
              }`
              const body = (
                <>
                  <span className="rank-badge" data-rank={absoluteRank}>
                    {absoluteRank}
                  </span>
                  {teamIds.get(t.team) != null && (
                    <TeamCrest teamId={teamIds.get(t.team)!} name={t.team} size={22} />
                  )}
                  <span className="flex-1 min-w-0">
                    <span className="block text-[0.9rem] font-medium leading-tight truncate">
                      {t.team}
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      {t.meta ? (
                        <span className="truncate">{t.meta}</span>
                      ) : (
                        <>
                          {tid ? (
                            <LeagueCrest tournamentId={tid} name={t.league} size={14} />
                          ) : null}
                          <span className="truncate">{LEAGUE_ABBR[t.league] ?? t.league}</span>
                        </>
                      )}
                    </span>
                  </span>
                  {(t.cols ?? []).map((c) => (
                    <span key={c.label} className="text-right shrink-0 hidden sm:block w-10">
                      <span
                        className="stat-figure text-sm block tabular-nums"
                        style={{ color: c.tone }}
                      >
                        {c.value}
                      </span>
                      <span className="stat-label">{c.label}</span>
                    </span>
                  ))}
                  <span
                    className="stat-figure text-lg w-14 text-right shrink-0 tabular-nums"
                    style={{
                      color:
                        t.ratingTone ?? (absoluteRank <= 3 ? "var(--pitch)" : undefined),
                    }}
                  >
                    {t.rating}
                  </span>
                </>
              )
              const key = `${t.team}-${t.league}`
              return t.href ? (
                <Link key={key} href={t.href} className={className}>
                  {body}
                </Link>
              ) : (
                <div key={key} className={className}>
                  {body}
                </div>
              )
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
