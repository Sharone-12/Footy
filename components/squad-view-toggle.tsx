"use client"

import { useSearchParams } from "next/navigation"
import { SlidingSegment } from "@/components/sliding-segment"

/** Cards or pitch for the squad. Rewrites ?view= like the other toggles. */
export function SquadViewToggle({ active }: { active: "cards" | "pitch" }) {
  const params = useSearchParams()

  function hrefFor(view: "cards" | "pitch"): string {
    const next = new URLSearchParams(params.toString())
    if (view === "cards") next.delete("view")
    else {
      next.set("view", "pitch")
      // The pitch always shows the whole XI, so a position filter has nothing to do.
      next.delete("pos")
    }
    const qs = next.toString()
    return qs ? `/squad?${qs}` : "/squad"
  }

  return (
    <SlidingSegment
      ariaLabel="Squad view"
      activeKey={active}
      items={[
        { key: "cards", label: "Cards", href: hrefFor("cards") },
        { key: "pitch", label: "Pitch", href: hrefFor("pitch") },
      ]}
    />
  )
}
