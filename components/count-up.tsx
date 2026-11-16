"use client"

import { useEffect, useState } from "react"

/**
 * A figure that counts up to its value on mount.
 *
 * The server renders the final number, so it is correct without JavaScript
 * and for anyone who prefers reduced motion; the count is decoration on top.
 */
export function CountUp({
  value,
  decimals = 0,
  duration = 900,
}: {
  value: number
  decimals?: number
  duration?: number
}) {
  const [shown, setShown] = useState(value)

  useEffect(() => {
    if (!Number.isFinite(value) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / duration)
      // Ease-out cubic: fast off the mark, settles onto the number.
      setShown(value * (1 - (1 - k) ** 3))
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])

  return <>{Number.isFinite(shown) ? shown.toFixed(decimals) : "—"}</>
}
