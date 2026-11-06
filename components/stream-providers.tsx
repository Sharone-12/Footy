"use client"

import { useState } from "react"
import { MatchStream } from "@/components/match-stream"
import type { DiscoveredEvent, DiscoveryResult, ProviderResult } from "@/lib/providers/types"

/**
 * Discovered providers for one fixture: the chosen player, then a row per
 * provider saying what it found.
 *
 * Every configured provider gets a row even when it found nothing, so a dead
 * provider or a missing key is visible instead of silently absent.
 */

const STATUS: Record<ProviderResult["availability"], { label: string; tone: string }> = {
  available: { label: "Available", tone: "var(--pitch)" },
  unavailable: { label: "No match found", tone: "var(--muted-foreground)" },
  unsupported: { label: "No public API", tone: "var(--muted-foreground)" },
  unconfigured: { label: "Not configured", tone: "var(--muted-foreground)" },
  error: { label: "Unavailable", tone: "var(--destructive)" },
}

function Row({
  provider,
  selected,
  onSelect,
}: {
  provider: ProviderResult
  selected: string | null
  onSelect: (event: DiscoveredEvent) => void
}) {
  const status = STATUS[provider.availability]
  const top = provider.events[0]
  const isSelected = top != null && selected === `${top.provider}:${top.eventId}`

  const detail = top
    ? `${top.status === "live" ? "Live now" : "Scheduled"} · ${Math.round(top.confidence * 100)}% match` +
      (top.embeddable ? "" : " · opens on site")
    : (provider.error ?? status.label)

  const body = (
    <>
      <span
        className="size-2 shrink-0 rounded-full"
        style={{ background: status.tone }}
        aria-hidden
      />
      <span className="min-w-0 flex-1 text-left">
        <span className="block font-semibold text-[0.9rem] truncate">{provider.provider}</span>
        <span className="stat-label block text-[0.65rem] truncate">{detail}</span>
      </span>
      {isSelected && (
        <span className="stat-label text-[0.6rem]" style={{ color: "var(--pitch)" }}>
          Playing
        </span>
      )}
    </>
  )

  if (!top) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 opacity-60" aria-disabled>
        {body}
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => onSelect(top)}
      className="flex w-full items-center gap-3 px-4 py-3 transition-colors hover:bg-foreground/[0.04]"
    >
      {body}
    </button>
  )
}

export function StreamProviders({
  result,
  title,
}: {
  result: DiscoveryResult
  title: string
}) {
  const found = result.providers.flatMap((p) => p.events)
  // Highest confidence first; an embeddable source always beats a link.
  const ranked = [...found].sort(
    (a, b) => Number(b.embeddable) - Number(a.embeddable) || b.confidence - a.confidence,
  )
  const [chosen, setChosen] = useState<DiscoveredEvent | null>(ranked[0] ?? null)

  return (
    <>
      {chosen ? (
        <MatchStream url={chosen.url} title={title} />
      ) : (
        <div className="surface bg-card rounded-2xl px-5 py-10 text-center">
          <p className="text-muted-foreground">No stream available for this match.</p>
          <p className="stat-label text-xs mt-2">
            Stream will be available 5 minutes before kickoff.
          </p>
        </div>
      )}

      <div className="surface bg-card rounded-2xl mt-4 divide-y divide-border overflow-hidden">
        {result.providers.map((p) => (
          <Row
            key={p.provider}
            provider={p}
            selected={chosen ? `${chosen.provider}:${chosen.eventId}` : null}
            onSelect={setChosen}
          />
        ))}
      </div>
    </>
  )
}
