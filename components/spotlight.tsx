"use client"

import { useEffect } from "react"

/**
 * A soft light that follows the cursor across whichever card it is over.
 *
 * One listener for the whole document rather than one per card: it writes the
 * pointer position into --mx/--my on the nearest `.surface`, and the CSS for
 * `.surface` paints a radial highlight there. Mouse only, one write a frame.
 */
export function Spotlight() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    let lit: HTMLElement | null = null
    let frame = 0
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const card = (e.target as Element | null)?.closest<HTMLElement>(".surface") ?? null
        if (lit && lit !== card) {
          lit.style.removeProperty("--mx")
          lit.style.removeProperty("--my")
        }
        lit = card
        if (!card) return
        const box = card.getBoundingClientRect()
        card.style.setProperty("--mx", `${e.clientX - box.left}px`)
        card.style.setProperty("--my", `${e.clientY - box.top}px`)
      })
    }
    document.addEventListener("pointermove", onMove, { passive: true })
    return () => {
      document.removeEventListener("pointermove", onMove)
      cancelAnimationFrame(frame)
    }
  }, [])
  return null
}
