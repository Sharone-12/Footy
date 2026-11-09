"use client"

import { useEffect, useState, useTransition } from "react"
import { usePathname, useSearchParams } from "next/navigation"

export function TopProgressBar() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  const [progress, setProgress] = useState(0)
  const [visible, setVisible] = useState(false)

  // Complete and hide progress bar whenever route/search changes
  useEffect(() => {
    setProgress(100)
    const timer = setTimeout(() => {
      setVisible(false)
      setProgress(0)
    }, 180)
    return () => clearTimeout(timer)
  }, [pathname, searchParams])

  // Listen for clicks on internal navigation links for instant (<16ms) feedback
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null

    const handleClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest("a")
      if (!target || !target.href) return

      if (
        target.target === "_blank" ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey ||
        e.defaultPrevented
      ) {
        return
      }

      try {
        const url = new URL(target.href, window.location.href)
        if (url.origin === window.location.origin) {
          const isSamePage =
            url.pathname === window.location.pathname &&
            url.search === window.location.search

          if (!isSamePage) {
            setVisible(true)
            setProgress(28)

            if (timer) clearInterval(timer)
            timer = setInterval(() => {
              setProgress((prev) => {
                if (prev >= 82) {
                  if (timer) clearInterval(timer)
                  return prev
                }
                const step = (85 - prev) * 0.15
                return prev + Math.max(step, 1.5)
              })
            }, 120)

            startTransition(() => {
              // Mark low priority transition
            })
          }
        }
      } catch {
        // Ignore invalid URLs
      }
    }

    document.addEventListener("click", handleClick, { capture: true })
    return () => {
      document.removeEventListener("click", handleClick, { capture: true })
      if (timer) clearInterval(timer)
    }
  }, [])

  if (!visible && progress === 0) return null

  return (
    <div
      aria-hidden="true"
      className="fixed top-0 left-0 right-0 h-[2.5px] z-[9999] pointer-events-none overflow-hidden transition-opacity duration-150 motion-reduce:hidden"
      style={{ opacity: visible ? 1 : 0 }}
    >
      <div
        className="h-full bg-gradient-to-r from-[var(--pitch)] via-emerald-400 to-[var(--pitch)] shadow-[0_0_10px_var(--pitch),0_0_4px_var(--pitch)] transition-all duration-200 ease-out"
        style={{
          width: `${progress}%`,
        }}
      />
    </div>
  )
}

