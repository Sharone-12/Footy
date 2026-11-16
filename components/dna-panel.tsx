"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowUpRightIcon } from "lucide-react"
import { TeamCrest } from "@/components/player-avatar"
import { Barcode } from "@/components/dna-barcode"
import type { ArchetypeFit, Match } from "@/lib/dna"

export type DnaMatch = Match & { href: string }

/**
 * The interactive half of Player DNA.
 *
 * Picking a "plays like" player morphs the big barcode into theirs and leaves
 * a line at this player's own value on every stat, so the gap between the bar
 * and the line is exactly where the two differ.
 */
export function DnaPanel({
  name,
  z,
  primary,
  also,
  thinMinutes,
  matches,
  abroad,
}: {
  name: string
  z: number[]
  primary: ArchetypeFit
  also: ArchetypeFit[]
  /** Set when the player is below the sample floor. */
  thinMinutes: number | null
  matches: DnaMatch[]
  abroad: DnaMatch[]
}) {
  const [peek, setPeek] = useState<DnaMatch | null>(null)

  return (
    <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-6 p-5">
      <div className="min-w-0">
        <div
          className="shimmer-text w-fit text-3xl sm:text-4xl font-bold tracking-[-0.03em] leading-none uppercase"
          style={{ fontFamily: "var(--font-condensed)" }}
        >
          {primary.name}
        </div>
        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{primary.blurb}</p>

        <div className="mt-5">
          <Barcode z={peek ? peek.z : z} ticks={peek ? z : undefined} height={72} animate />
          <div className="flex justify-between stat-label mt-1.5">
            <span>attack</span>
            <span>build-up</span>
            <span>defence</span>
          </div>
          <p className="stat-label mt-2 min-h-[1rem]" aria-live="polite">
            {peek
              ? `Showing ${peek.player} · lines mark ${name}`
              : "Pick a player on the right to lay their style over this one"}
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5 mt-3">
          {also.map((a) => (
            <span
              key={a.name}
              title={a.blurb}
              className="stat-label rounded-full px-2.5 py-1 border border-border/70"
            >
              also {a.name}
            </span>
          ))}
          {thinMinutes != null && (
            <span className="stat-label rounded-full px-2.5 py-1 border border-border/70">
              thin sample · {thinMinutes} min
            </span>
          )}
        </div>
      </div>

      <div className="min-w-0">
        <h3 className="stat-label mb-1.5">Plays like</h3>
        <div className="-mx-2">
          {matches.map((m) => {
            const on = peek?.slug === m.slug
            return (
              <div
                key={m.slug}
                className={`row-item flex items-center gap-1 rounded-xl ${on ? "bg-muted/60" : ""}`}
              >
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => setPeek(on ? null : m)}
                  className="flex flex-1 min-w-0 items-center gap-3 px-2 py-2 text-left rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="flex-1 min-w-0">
                    <span className="block text-[0.9rem] font-medium leading-tight truncate">
                      {m.player}
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      {m.team_id != null && <TeamCrest teamId={m.team_id} name={m.team} size={14} />}
                      <span className="truncate">{m.team} · {m.role}</span>
                    </span>
                  </span>
                  <span className="w-20 sm:w-24 shrink-0 hidden min-[400px]:block">
                    <Barcode z={m.z} height={26} />
                  </span>
                  <span className="stat-figure text-lg w-12 text-right shrink-0">
                    {m.similarity}
                    <span className="text-xs text-muted-foreground">%</span>
                  </span>
                </button>
                <Link
                  href={m.href}
                  aria-label={`Open ${m.player}`}
                  className="inline-flex items-center justify-center size-8 mr-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors shrink-0"
                >
                  <ArrowUpRightIcon className="size-4" />
                </Link>
              </div>
            )
          })}
        </div>

        {abroad.length > 0 && (
          <>
            <h3 className="stat-label mt-4 mb-2">Nearest match in other leagues</h3>
            <div className="flex flex-wrap gap-1.5">
              {abroad.map((m) => (
                <Link
                  key={m.slug}
                  href={m.href}
                  title={`${m.league} · ${m.similarity}% alike`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border/70 px-2.5 py-1 text-xs hover:bg-muted/50 transition-colors"
                >
                  {m.team_id != null && <TeamCrest teamId={m.team_id} name={m.team} size={14} />}
                  <span className="truncate max-w-[9rem]">{m.player}</span>
                  <span className="text-muted-foreground tabular-nums">{m.similarity}%</span>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
