"use client"

import { useSearchParams } from "next/navigation"
import { SlidingSegment } from "@/components/sliding-segment"
import { SQUAD_POSITIONS, DEFAULT_POSITION, resolvePosition } from "@/lib/squad"

/**
 * Position tabs for the squad grid. Rewrites ?pos= like the other toggles,
 * and reads its own active tab from the URL so the pill moves on click.
 *
 * The pitch shows the whole eleven, so there is nothing to filter there and
 * this renders nothing.
 */
export function SquadPositionFilter() {
  const params = useSearchParams()
  const active = resolvePosition(params.get("pos"))

  function hrefFor(key: string): string {
    const next = new URLSearchParams(params.toString())
    if (key === DEFAULT_POSITION) next.delete("pos")
    else next.set("pos", key)
    const qs = next.toString()
    return qs ? `/squad?${qs}` : "/squad"
  }

  if (params.get("view") === "pitch") return null

  return (
    <SlidingSegment
      ariaLabel="Position"
      activeKey={active}
      items={SQUAD_POSITIONS.map((p) => ({
        key: p.key,
        label: p.label,
        href: hrefFor(p.key),
      }))}
    />
  )
}
