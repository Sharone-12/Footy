"use client"

import { useState } from "react"
import dynamic from "next/dynamic"

/**
 * The opt-in wrapper around the 3D scoreline view.
 *
 * three.js and the fiber renderer are the heaviest thing on this page by a
 * wide margin, and the table above has already answered the question for most
 * readers. So the chunk is not in the page until someone asks for it: the
 * import below is only evaluated on the first click, and a visitor who never
 * clicks never pays for it.
 *
 * `ssr: false` because WebGL needs a canvas. There is nothing to prerender,
 * and the table is the no-JavaScript version of this view.
 */
const Canvas = dynamic(() => import("@/components/scoreline-surface-canvas"), {
  ssr: false,
  loading: () => (
    <div className="h-[260px] sm:h-[300px] grid place-items-center">
      <span className="stat-label text-[0.6rem]">Loading</span>
    </div>
  ),
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
  const [open, setOpen] = useState(false)

  return (
    <div className="mt-4 pt-4 border-t border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="stat-label text-[0.65rem] hover:text-foreground transition-colors"
      >
        {open ? "Hide 3D view" : "Show 3D view"}
      </button>

      {open && (
        <>
          <Canvas cells={cells} last={last} />
          {/* The canvas has no type in it — drawing text in WebGL costs a font
              loader and a second rendering path to say what one line of HTML
              says here. */}
          <p className="stat-label text-[0.6rem] mt-1 normal-case tracking-normal">
            Bar height is the chance of that scoreline. {home} goals run{" "}
            {labels[0]}–{labels[last]} one way, {away} goals the other. Drag to
            turn it.
          </p>
        </>
      )}
    </div>
  )
}
