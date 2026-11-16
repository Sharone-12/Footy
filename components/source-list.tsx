"use client"

import { useEffect, useMemo, useState } from "react"
import { CheckIcon } from "lucide-react"
import type { WatchProvider, WatchSource } from "@/lib/streaming/resolve"
import type { StreamingProviderId } from "@/lib/streaming/types"

type Health = { id: string; status: "operational" | "degraded" | "down"; latencyMs: number }

const SHOWN = 10
const DOT = { operational: "var(--pitch)", degraded: "oklch(0.8 0.15 75)", down: "oklch(0.6 0.2 25)" }

/**
 * Every stream for the match as one ranked list.
 *
 * It used to be a box per provider, each with its own pills to expand, which
 * asks you to know which provider is good before you can pick a stream. Here
 * the order does that work: live feeds first, then the providers in the
 * order the site already prefers them, each row carrying its provider's
 * health so a slow or failing one can be skipped at a glance.
 */
export function SourceList({
  providers,
  current,
  onPick,
}: {
  providers: WatchProvider[]
  current: WatchSource | null
  onPick: (providerId: StreamingProviderId, sourceKey: string) => void
}) {
  const [health, setHealth] = useState<{ at: number; by: Map<string, Health> } | null>(null)
  const [all, setAll] = useState(false)

  useEffect(() => {
    let alive = true
    fetch("/api/streams/health")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { timestamp: number; providers: Health[] } | null) => {
        if (alive && j?.providers) {
          setHealth({ at: j.timestamp, by: new Map(j.providers.map((p) => [p.id, p])) })
        }
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  const rows = useMemo(() => {
    const flat = providers.flatMap((p) => p.sources.map((source) => ({ provider: p, source })))
    // Stable sort: live ahead of not, provider preference order otherwise kept.
    return flat.sort((a, b) => Number(b.source.live) - Number(a.source.live))
  }, [providers])

  // Whatever is playing stays in view even when the list is cut short.
  const shown = useMemo(() => {
    if (all || rows.length <= SHOWN) return rows
    const head = rows.slice(0, SHOWN)
    const playing = rows.find((r) => r.source.key === current?.key)
    return playing && !head.includes(playing) ? [...head.slice(0, SHOWN - 1), playing] : head
  }, [rows, all, current])

  return (
    <div className="flex flex-col gap-1">
      {shown.map(({ provider, source }, i) => {
        const on = current?.key === source.key
        const h = health?.by.get(provider.id)
        return (
          <button
            key={source.key}
            type="button"
            onClick={() => onPick(provider.id, source.key)}
            aria-pressed={on}
            className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors ${
              on
                ? "bg-[var(--pitch)] text-black"
                : "bg-background/40 hover:bg-accent border border-border/50"
            }`}
          >
            <span className={`stat-figure text-[0.7rem] w-4 text-center tabular-nums ${on ? "" : "text-muted-foreground"}`}>
              {on ? <CheckIcon className="size-3.5 stroke-[3]" /> : i + 1}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-xs font-bold leading-tight truncate">{source.label}</span>
              <span className={`flex items-center gap-1.5 text-[0.65rem] leading-tight ${on ? "text-black/70" : "text-muted-foreground"}`}>
                <span
                  className="size-1.5 rounded-full shrink-0"
                  title={h ? `${provider.name}: ${h.status}` : `${provider.name}: not checked`}
                  style={{ background: h ? DOT[h.status] : "oklch(0.5 0 0)" }}
                />
                <span className="truncate">{provider.name}</span>
                {h && <span className="tabular-nums shrink-0">· {h.latencyMs}ms</span>}
              </span>
            </span>
            {source.quality && (
              <span className={`text-[9px] font-mono font-bold px-1 rounded shrink-0 ${on ? "bg-black/15" : "bg-white/10 text-muted-foreground"}`}>
                {source.quality}
              </span>
            )}
          </button>
        )
      })}

      <div className="flex items-center justify-between pt-1.5">
        {rows.length > SHOWN ? (
          <button
            type="button"
            onClick={() => setAll((v) => !v)}
            className="text-[10px] font-bold text-[var(--pitch)] hover:underline"
          >
            {all ? "Show fewer" : `Show all ${rows.length}`}
          </button>
        ) : (
          <span />
        )}
        {health && (
          <span className="text-[10px] text-muted-foreground tabular-nums">
            checked {new Date(health.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
      </div>
    </div>
  )
}
