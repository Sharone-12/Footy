"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ExternalLinkIcon, PlayIcon, TvMinimalPlayIcon } from "lucide-react"
import { TeamCrest, LeagueCrest } from "@/components/player-avatar"
import { LEAGUE_TOURNAMENT_ID } from "@/lib/teams"
import { splitFixtures, startOf, type Timed } from "@/lib/live"
import { gatewaySources } from "@/lib/providers/registry"
import type { MatchedStream } from "@/lib/streamfree/types"
import { StreamFreePlayer } from "@/components/streamfree-player"

export type LiveFixture = Timed & {
  event_id: number
  league: string
  home: string
  home_id: number | null
  away: string
  away_id: number | null
}

function formatKickoff(m: LiveFixture) {
  if (!m.kickoff) {
    return new Date(`${m.date}T12:00:00Z`).toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    })
  }
  const d = new Date(m.kickoff)
  const today = new Date().toDateString() === d.toDateString()
  return d.toLocaleString("en-GB", {
    ...(today ? {} : { weekday: "short", day: "numeric", month: "short" }),
    hour: "2-digit",
    minute: "2-digit",
  })
}

function elapsed(m: LiveFixture, now: number) {
  return Math.max(1, Math.floor((now - startOf(m)) / 60_000))
}

function Row({
  m,
  now,
  live,
  matchedStream,
  onWatch,
}: {
  m: LiveFixture
  now: number
  live: boolean
  matchedStream?: MatchedStream
  onWatch?: (stream: MatchedStream) => void
}) {
  const tid = LEAGUE_TOURNAMENT_ID[m.league]

  return (
    <div className="card-lift fixture-row surface bg-card rounded-2xl px-4 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 transition-all">
      <Link
        href={`/predictions/match?id=${m.event_id}`}
        className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1 group"
      >
        <span className="flex flex-col leading-none w-20 sm:w-24 shrink-0">
          {live ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="relative flex size-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--pitch)] opacity-75 motion-reduce:hidden" />
                <span className="relative inline-flex rounded-full size-2 bg-[var(--pitch)]" />
              </span>
              <span className="stat-label text-[0.65rem] font-bold" style={{ color: "var(--pitch)" }}>
                LIVE {elapsed(m, now)}&apos;
              </span>
            </span>
          ) : (
            <span className="stat-figure text-sm text-muted-foreground font-medium">
              {formatKickoff(m)}
            </span>
          )}
        </span>
        <span className="flex items-center gap-2 min-w-0 flex-1">
          {m.home_id != null && <TeamCrest teamId={m.home_id} name={m.home} size={26} />}
          <span className="truncate font-semibold text-[0.9rem] group-hover:text-[var(--pitch)] transition-colors">
            {m.home}
          </span>
          <span className="stat-label text-[0.6rem] shrink-0 text-muted-foreground">v</span>
          {m.away_id != null && <TeamCrest teamId={m.away_id} name={m.away} size={26} />}
          <span className="truncate font-semibold text-[0.9rem] group-hover:text-[var(--pitch)] transition-colors">
            {m.away}
          </span>
        </span>
      </Link>

      <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/50">
        {/* StreamFree stream badge and watch button */}
        {matchedStream && (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              {matchedStream.isLive ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.65rem] font-bold bg-[var(--pitch)]/15 text-[var(--pitch)] border border-[var(--pitch)]/30">
                  <span className="relative flex size-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--pitch)] opacity-75 motion-reduce:hidden" />
                    <span className="relative inline-flex rounded-full size-1.5 bg-[var(--pitch)]" />
                  </span>
                  STREAM
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[0.65rem] font-medium bg-white/5 text-muted-foreground border border-white/10">
                  {matchedStream.status}
                </span>
              )}

              {matchedStream.availableQualities.length > 0 && (
                <div className="hidden md:flex items-center gap-0.5">
                  {matchedStream.availableQualities.slice(0, 2).map((q) => (
                    <span
                      key={q}
                      className="px-1.5 py-0.5 rounded bg-black/40 text-[0.65rem] font-mono text-muted-foreground border border-border/60"
                    >
                      {q}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => onWatch?.(matchedStream)}
              aria-label={`Watch stream for ${m.home} vs ${m.away}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--pitch)] text-black hover:brightness-110 font-bold text-xs shadow-md transition-all hover:scale-[1.03]"
            >
              <PlayIcon className="size-3 fill-current" />
              Watch
            </button>
          </div>
        )}

        <div className="flex items-center gap-2 shrink-0">
          <span className="hidden sm:inline text-xs text-muted-foreground truncate max-w-[130px]">
            {m.league}
          </span>
          {tid && <LeagueCrest tournamentId={tid} name={m.league} size={20} />}
        </div>
      </div>
    </div>
  )
}

function Section({
  title,
  rows,
  now,
  live,
  empty,
  streamMap,
  onWatch,
}: {
  title: string
  rows: LiveFixture[]
  now: number
  live?: boolean
  empty: string
  streamMap: Record<number, MatchedStream>
  onWatch: (stream: MatchedStream) => void
}) {
  return (
    <section>
      <div className="flex items-center justify-between mb-2.5">
        <h2
          className="text-lg font-semibold tracking-tight uppercase"
          style={{ fontFamily: "var(--font-condensed)" }}
        >
          {title}
        </h2>
        {rows.length > 0 && (
          <span className="text-xs text-muted-foreground tabular-nums">
            {rows.length} match{rows.length === 1 ? "" : "es"}
          </span>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">{empty}</p>
      ) : (
        <div className="flex flex-col gap-2.5 stagger">
          {rows.map((m) => (
            <Row
              key={m.event_id}
              m={m}
              now={now}
              live={Boolean(live)}
              matchedStream={streamMap[m.event_id]}
              onWatch={onWatch}
            />
          ))}
        </div>
      )}
    </section>
  )
}

export function LiveSections({ matches }: { matches: LiveFixture[] }) {
  const [now, setNow] = useState<number | null>(null)
  const [streamMap, setStreamMap] = useState<Record<number, MatchedStream>>({})
  const [activeStream, setActiveStream] = useState<MatchedStream | null>(null)
  const gateways = gatewaySources()

  useEffect(() => {
    const tick = () => setNow(Date.now())
    tick()
    const t = setInterval(tick, 60_000)
    return () => clearInterval(t)
  }, [])

  // Fetch StreamFree stream matches on mount
  useEffect(() => {
    let unmounted = false
    async function loadStreams() {
      try {
        const res = await fetch("/api/streamfree")
        if (!res.ok) return
        const data = await res.json()
        if (data?.streams && Array.isArray(data.streams) && !unmounted) {
          const map: Record<number, MatchedStream> = {}
          for (const s of data.streams) {
            if (s.event_id) map[s.event_id] = s
          }
          setStreamMap(map)
        }
      } catch (err) {
        console.warn("[live] Could not load streamfree matches:", err)
      }
    }
    loadStreams()
    return () => {
      unmounted = true
    }
  }, [])

  // Close player with Esc key
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setActiveStream(null)
    }
    if (activeStream) {
      window.addEventListener("keydown", onKeyDown)
      return () => window.removeEventListener("keydown", onKeyDown)
    }
  }, [activeStream])

  // Before mount there is no clock, so nothing can be bucketed yet.
  const { live, soon, upcoming } = splitFixtures(matches, now ?? 0)

  return (
    <div className="flex flex-col gap-8 relative">
      {/* Active StreamFree Video Player Modal */}
      {activeStream && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`StreamFree player: ${activeStream.title}`}
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md animate-fade-in"
          onClick={() => setActiveStream(null)}
        >
          <div
            className="w-full max-w-4xl max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <StreamFreePlayer
              stream={activeStream}
              onClose={() => setActiveStream(null)}
            />
          </div>
        </div>
      )}

      {gateways.length > 0 && (
        <aside
          aria-label="External streaming gateways"
          className="surface bg-card/70 border border-border/80 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm"
        >
          <div className="flex items-start gap-3">
            <span className="relative flex size-2.5 mt-1 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75 motion-reduce:hidden" />
              <span className="relative inline-flex rounded-full size-2.5 bg-amber-500" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span
                  className="text-sm font-bold uppercase tracking-wider text-foreground"
                  style={{ fontFamily: "var(--font-condensed)" }}
                >
                  External Streaming Gateways
                </span>
                <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20">
                  External
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Third-party stream indexes. Click to visit in a new tab (leaves app).
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {gateways.map((source) => (
              <a
                key={source.name}
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${source.name} external stream gateway, opens in a new tab`}
                className="card-lift surface bg-card hover:bg-accent/40 border border-border px-3.5 py-2 rounded-xl flex items-center gap-2 text-xs font-semibold transition-colors group"
              >
                <span>{source.name}</span>
                <ExternalLinkIcon
                  className="size-3 text-muted-foreground group-hover:text-foreground transition-colors"
                  aria-hidden
                />
              </a>
            ))}
          </div>
        </aside>
      )}

      <Section
        title="Live Now"
        rows={now == null ? [] : live}
        now={now ?? 0}
        live
        empty="No matches in play."
        streamMap={streamMap}
        onWatch={setActiveStream}
      />
      <Section
        title="Starting Soon"
        rows={now == null ? [] : soon}
        now={now ?? 0}
        empty="Nothing kicking off in the next three hours."
        streamMap={streamMap}
        onWatch={setActiveStream}
      />
      <Section
        title="Upcoming Matches"
        rows={now == null ? [] : upcoming}
        now={now ?? 0}
        empty="No upcoming fixtures."
        streamMap={streamMap}
        onWatch={setActiveStream}
      />
    </div>
  )
}
