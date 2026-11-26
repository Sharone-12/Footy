"use client"

import { useEffect, useRef, useState } from "react"
import dynamic from "next/dynamic"
import type { WaveMatch } from "@/components/season-wave-canvas"

/**
 * The 3D season, loaded when it is scrolled to.
 *
 * three.js and the fiber renderer are the heaviest thing on this page by a
 * wide margin, so the chunk is not in the page until the section is actually
 * reached — but it is not behind a button either. A view nobody finds is the
 * same as a view that does not exist, and the scarf section is where the eye
 * is already going.
 *
 * `ssr: false` because WebGL needs a canvas. There is nothing to prerender,
 * and the flat scarf above is the no-JavaScript version of this.
 */
const Canvas = dynamic(() => import("@/components/season-wave-canvas"), {
  ssr: false,
  loading: () => <div className="h-[200px] sm:h-[240px]" />,
})

export function SeasonWave({ matches }: { matches: WaveMatch[] }) {
  const host = useRef<HTMLDivElement | null>(null)
  // No IntersectionObserver is not a reason to withhold the view: without one,
  // start loaded. Decided here rather than in the effect so the first render
  // already knows, and both branches render the same placeholder box on the
  // server either way.
  const [near, setNear] = useState(
    () => typeof window !== "undefined" && typeof IntersectionObserver === "undefined",
  )

  useEffect(() => {
    const el = host.current
    if (!el || near || typeof IntersectionObserver === "undefined") return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true)
          io.disconnect()
        }
      },
      // A screen of warning, so the chunk is usually there by the time the
      // section is, and the entrance plays rather than arriving half-run.
      { rootMargin: "300px 0px" },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [near])

  if (matches.length < 2) return null

  return (
    <div ref={host} className="mt-4 pt-4 border-t border-border">
      {near ? <Canvas matches={matches} /> : <div className="h-[200px] sm:h-[240px]" />}
      <p className="stat-label text-[0.6rem] mt-1 normal-case tracking-normal">
        Each block is a match, oldest on the left: height is the winning margin,
        above the line for a win and below it for a defeat. The gold ridge
        behind is how much that night looked like Barça. Drag to turn it.
      </p>
    </div>
  )
}
