"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { TeamCrest } from "@/components/player-avatar"
import { Flip } from "@/components/flip"
import { clubColor } from "@/lib/club-colors"
import { formatDateIST } from "@/lib/time"
import type { LiveFixture } from "@/components/live-sections"
import type { MatchPrediction } from "@/lib/predictions"

type Past = {
  event_id: number
  date: string
  home: string
  home_id: number | null
  away: string
  away_id: number | null
  home_goals: number | null
  away_goals: number | null
}

const COLS = "event_id, date, home, home_id, away, away_id, home_goals, away_goals"
const pad = (n: number) => String(n).padStart(2, "0")

function resultFor(m: Past, teamId: number): "W" | "D" | "L" {
  const ours = m.home_id === teamId ? m.home_goals! : m.away_goals!
  const theirs = m.home_id === teamId ? m.away_goals! : m.home_goals!
  return ours > theirs ? "W" : ours < theirs ? "L" : "D"
}

const TONE = { W: "var(--pitch)", D: "oklch(0.58 0 0)", L: "oklch(0.55 0.16 25)" }

/** A side's last five as a strip, oldest on the left. */
function Form({ rows, teamId }: { rows: Past[]; teamId: number }) {
  if (!rows.length) return <span className="stat-label">no recent results</span>
  return (
    <span className="flex h-2.5 w-28 rounded-[2px] overflow-hidden gap-px">
      {[...rows].reverse().map((m) => {
        const r = resultFor(m, teamId)
        return (
          <span
            key={m.event_id}
            title={`${r} ${m.home} ${m.home_goals}–${m.away_goals} ${m.away}`}
            className="flex-1"
            style={{ background: TONE[r] }}
          />
        )
      })}
    </span>
  )
}

/**
 * What fills the player before the streams unlock: the countdown, both sides'
 * form, the model's call and the last meetings we hold.
 *
 * It used to be a black box with a sentence in it. Everything here comes from
 * the site's own tables, read once, so it works days ahead of kickoff when no
 * live feed knows the match yet.
 */
export function PreMatchStudio({
  fixture,
  kickoffMs,
  now,
  prediction,
}: {
  fixture: LiveFixture
  kickoffMs: number
  now: number
  prediction: MatchPrediction | null
}) {
  const [past, setPast] = useState<{ home: Past[]; away: Past[]; h2h: Past[] } | null>(null)
  const { home_id: h, away_id: a } = fixture

  useEffect(() => {
    if (h == null || a == null) return
    let alive = true
    const finished = () => supabase.from("matches").select(COLS).eq("status", "finished").not("home_goals", "is", null)
    const lastFive = (id: number) =>
      finished().or(`home_id.eq.${id},away_id.eq.${id}`).order("date", { ascending: false }).limit(5)
    Promise.all([
      lastFive(h),
      lastFive(a),
      finished()
        .or(`and(home_id.eq.${h},away_id.eq.${a}),and(home_id.eq.${a},away_id.eq.${h})`)
        .order("date", { ascending: false })
        .limit(5),
    ]).then(([home, away, h2h]) => {
      if (!alive) return
      setPast({
        home: (home.data ?? []) as Past[],
        away: (away.data ?? []) as Past[],
        h2h: (h2h.data ?? []) as Past[],
      })
    })
    return () => {
      alive = false
    }
  }, [h, a])

  const left = Math.max(0, kickoffMs - now)
  const d = Math.floor(left / 86_400_000)
  const hh = Math.floor(left / 3_600_000) % 24
  const mm = Math.floor(left / 60_000) % 60
  const ss = Math.floor(left / 1000) % 60
  const homeTone = clubColor(fixture.home) ?? "var(--pitch)"
  const awayTone = clubColor(fixture.away) ?? "oklch(0.8 0 0)"

  return (
    <div className="absolute inset-0 z-20 overflow-y-auto bg-[radial-gradient(ellipse_at_top,oklch(0.24_0_0),oklch(0.1_0_0)_70%)]">
      <div className="min-h-full flex flex-col items-center justify-center gap-4 sm:gap-6 p-4 sm:p-8 text-center">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-8 w-full max-w-2xl">
          <div className="flex flex-col items-center gap-2 min-w-0">
            {h != null && <TeamCrest teamId={h} name={fixture.home} size={64} />}
            <span
              className="text-base sm:text-2xl font-bold uppercase leading-none line-clamp-2"
              style={{ fontFamily: "var(--font-condensed)", color: homeTone }}
            >
              {fixture.home}
            </span>
            {past && h != null && <Form rows={past.home} teamId={h} />}
          </div>

          <div className="flex flex-col items-center gap-1.5">
            <span className="stat-label">Kick-off in</span>
            <span
              className="stat-figure text-3xl sm:text-5xl text-white"
              style={{ fontFamily: "var(--font-condensed)" }}
            >
              <Flip value={d > 0 ? `${d}d ${pad(hh)}:${pad(mm)}:${pad(ss)}` : `${pad(hh)}:${pad(mm)}:${pad(ss)}`} />
            </span>
            <span className="stat-label">
              {formatDateIST(kickoffMs, { weekday: "short", day: "numeric", month: "short" })}
            </span>
          </div>

          <div className="flex flex-col items-center gap-2 min-w-0">
            {a != null && <TeamCrest teamId={a} name={fixture.away} size={64} />}
            <span
              className="text-base sm:text-2xl font-bold uppercase leading-none line-clamp-2"
              style={{ fontFamily: "var(--font-condensed)", color: awayTone }}
            >
              {fixture.away}
            </span>
            {past && a != null && <Form rows={past.away} teamId={a} />}
          </div>
        </div>

        {prediction && (
          <div className="w-full max-w-md">
            <div className="flex h-2.5 rounded-full overflow-hidden gap-px">
              <span className="bar-grow" style={{ flexGrow: prediction.homeWin, background: homeTone }} />
              <span className="bar-grow" style={{ flexGrow: prediction.draw, background: "oklch(0.5 0 0)" }} />
              <span className="bar-grow" style={{ flexGrow: prediction.awayWin, background: awayTone, opacity: 0.7 }} />
            </div>
            <div className="flex justify-between stat-label mt-1.5 tabular-nums">
              <span>{Math.round(prediction.homeWin)}% win</span>
              <span>{Math.round(prediction.draw)}% draw · the model</span>
              <span>{Math.round(prediction.awayWin)}% win</span>
            </div>
          </div>
        )}

        {past && past.h2h.length > 0 && (
          <div className="w-full max-w-md">
            <div className="stat-label mb-1.5">Last meetings we hold</div>
            <div className="flex flex-col gap-1">
              {past.h2h.map((m) => (
                <div key={m.event_id} className="grid grid-cols-[4.5rem_1fr_auto_1fr] items-center gap-2 text-xs text-white/85">
                  <span className="text-white/45 text-left tabular-nums">
                    {formatDateIST(`${m.date}T12:00:00Z`, { day: "numeric", month: "short" })}
                  </span>
                  <span className="truncate text-right">{m.home}</span>
                  <span className="stat-figure text-white tabular-nums">
                    {m.home_goals}–{m.away_goals}
                  </span>
                  <span className="truncate text-left">{m.away}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="stat-label">Streams unlock 15 minutes before kick-off and load here on their own</p>
      </div>
    </div>
  )
}
