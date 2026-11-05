"use client"

import { useSearchParams } from "next/navigation"
import { SlidingSegment } from "@/components/sliding-segment"
import { SQUAD_POSITIONS, DEFAULT_POSITION } from "@/lib/squad"

/** Position tabs for the squad grid. Rewrites ?pos= like the other toggles. */
export function SquadPositionFilter({ active }: { active: string }) {
  const params = useSearchParams()

  function hrefFor(key: string): string {
    const next = new URLSearchParams(params.toString())
    if (key === DEFAULT_POSITION) next.delete("pos")
    else next.set("pos", key)
    const qs = next.toString()
    return qs ? `/squad?${qs}` : "/squad"
  }

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
