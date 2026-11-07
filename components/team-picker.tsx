"use client"

import { useEffect, useMemo, useState } from "react"
import { PencilIcon, SearchIcon, XIcon } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { TeamCrest, LeagueCrest } from "@/components/player-avatar"
import { BARCA_ID, LEAGUE_ABBR, LEAGUE_TOURNAMENT_ID } from "@/lib/teams"
import { fold } from "@/lib/search"
import {
  writePreferredTeam,
  type PreferredTeam,
} from "@/lib/preferred-team"

type TeamOption = { id: number; name: string; league: string }

/**
 * Fetched once per page load and shared: the list is ~100 clubs and only
 * changes when the fixture list does, so every pill mount re-requesting it
 * would be waste. Mirrors the module-level cache in player-search.tsx.
 */
let cache: TeamOption[] | null = null
let inflight: Promise<TeamOption[]> | null = null

function loadTeams(): Promise<TeamOption[]> {
  if (cache) return Promise.resolve(cache)
  inflight ??= fetch("/api/teams")
    .then((r) => (r.ok ? r.json() : { teams: [] }))
    .then((j: { teams?: TeamOption[] }) => {
      cache = j.teams ?? []
      return cache
    })
    .catch(() => [])
  return inflight
}

/**
 * The pencil beside the countdown: choose which club the nav pill follows.
 *
 * Deliberately a sibling of the pill's link rather than a child — the pill is
 * one big anchor, and a button nested inside an anchor is invalid HTML and
 * swallows its own clicks in some browsers.
 */
export function TeamPicker({ current }: { current: PreferredTeam | null }) {
  const [open, setOpen] = useState(false)
  const [teams, setTeams] = useState<TeamOption[] | null>(null)
  const [q, setQ] = useState("")

  // Only fetched when the dialog is first opened, so the nav costs nothing
  // on a page where nobody touches it.
  useEffect(() => {
    if (!open || teams) return
    let alive = true
    loadTeams().then((t) => {
      if (alive) setTeams(t)
    })
    return () => {
      alive = false
    }
  }, [open, teams])

  const shown = useMemo(() => {
    if (!teams) return []
    const needle = fold(q.trim())
    if (!needle) return teams
    return teams.filter(
      (t) => fold(t.name).includes(needle) || fold(t.league).includes(needle),
    )
  }, [teams, q])

  const choose = (t: TeamOption | null) => {
    writePreferredTeam(t ? { id: t.id, name: t.name } : null)
    setOpen(false)
    setQ("")
  }

  const activeId = current?.id ?? BARCA_ID

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        aria-label="Change which team the countdown follows"
        title="Change team"
        className="pointer-events-auto shrink-0 inline-flex items-center justify-center size-5 rounded-full text-muted-foreground hover:text-[var(--pitch)] hover:bg-white/[0.08] transition-colors"
      >
        <PencilIcon className="size-3" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-4 border-b border-white/5 pr-14">
          <DialogTitle
            className="text-xl font-semibold tracking-tight uppercase leading-tight"
            style={{ fontFamily: "var(--font-condensed)" }}
          >
            Followed team
          </DialogTitle>
          <span className="stat-label mt-1 block">
            The nav counts down to this club&apos;s next fixture
          </span>
          <div className="relative mt-4">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            <Input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search club or league…"
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

        <div className="max-h-[55vh] overflow-y-auto px-2 py-2">
          {teams == null ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              Loading clubs…
            </p>
          ) : shown.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              {teams.length === 0 ? "No clubs available." : "No club matches."}
            </p>
          ) : (
            shown.map((t) => {
              const tid = LEAGUE_TOURNAMENT_ID[t.league]
              const active = t.id === activeId
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => choose(t)}
                  className={`row-item w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl ${
                    active ? "bg-white/[0.06]" : ""
                  }`}
                >
                  <TeamCrest teamId={t.id} name={t.name} size={22} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[0.9rem] font-medium leading-tight truncate">
                      {t.name}
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      {tid ? <LeagueCrest tournamentId={tid} name={t.league} size={14} /> : null}
                      <span className="truncate">{LEAGUE_ABBR[t.league] ?? t.league}</span>
                    </span>
                  </span>
                  {active && (
                    <span className="stat-label text-[0.6rem]" style={{ color: "var(--pitch)" }}>
                      Following
                    </span>
                  )}
                </button>
              )
            })
          )}
        </div>

        {current && (
          <div className="border-t border-white/5 px-3 py-2.5">
            <button
              type="button"
              onClick={() => choose(null)}
              className="row-item w-full text-left px-3 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground"
            >
              Reset to Barça
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
