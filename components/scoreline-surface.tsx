"use client"

import { useEffect, useRef, useState } from "react"
import dynamic from "next/dynamic"

/**
 * The 3D scoreline view, loaded when it is scrolled to.
 *
 * three.js and the fiber renderer are the heaviest thing on this page by a
 * wide margin, so the chunk is not in the page until the card is actually
 * reached. It used to sit behind a "Show 3D view" button for the same reason,
 * which cost less and showed nobody anything: a view that has to be found is a
 * view that does not exist. Loading on approach keeps the saving and drops the
 * hunt.
 *
 * `ssr: false` because WebGL needs a canvas. There is nothing to prerender,
 * and the table above is the no-JavaScript version of this view.
 */
const Canvas = dynamic(() => import("@/components/scoreline-surface-canvas"), {
  ssr: false,
  loading: () => <div className="h-[260px] sm:h-[300px]" />,
})

export function ScorelineSurface({
  cells,
  labels,
  last,
  home,
  away,
}: {
  cells: number[][]
  labels: string[]
  last: number
  home: string
  away: string
}) {
  const host = useRef<HTMLDivElement | null>(null)
  // Without an IntersectionObserver, start loaded rather than withhold the
  // view. Decided here so the first render already knows; both branches render
  // the same placeholder box on the server either way.
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
      // card is, and the entrance plays rather than arriving half-run.
      { rootMargin: "300px 0px" },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [near])

  return (
    <div ref={host} className="mt-4 pt-4 border-t border-border">
      {near ? (
        <Canvas cells={cells} last={last} />
      ) : (
        <div className="h-[260px] sm:h-[300px]" />
      )}
      {/* The canvas has no type in it — drawing text in WebGL costs a font
          loader and a second rendering path to say what one line of HTML says
          here. */}
      <p className="stat-label text-[0.6rem] mt-1 normal-case tracking-normal">
        Bar height is the chance of that scoreline, and the board under it is the
        same colour map as the table. {home} goals run {labels[0]}–{labels[last]}{" "}
        one way, {away} goals the other. Drag to turn it.
      </p>
    </div>
  )
}
