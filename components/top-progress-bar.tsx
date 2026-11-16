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
    // Long enough for the ball to reach the net and the net to ripple.
    const timer = setTimeout(() => {
      setVisible(false)
      setProgress(0)
    }, 520)
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
      className="fixed top-0 left-0 right-0 h-6 z-[9999] pointer-events-none transition-opacity duration-150 motion-reduce:hidden"
      style={{ opacity: visible ? 1 : 0 }}
    >
      {/* The trail the ball leaves along the top edge. */}
      <div
        className="h-[2.5px] bg-gradient-to-r from-transparent via-[var(--pitch)] to-[var(--pitch)] shadow-[0_0_10px_var(--pitch)] transition-all duration-200 ease-out"
        style={{ width: `calc(${progress}% - 14px)` }}
      />
      {/* The ball: rolls as far as the page has loaded, spinning as it goes. */}
      <svg
        viewBox="0 0 24 24"
        className="absolute top-0 size-[15px] -translate-x-full transition-all duration-200 ease-out drop-shadow-[0_0_6px_var(--pitch)]"
        style={{ left: `calc(${progress}% - 12px)`, rotate: `${progress * 9}deg` }}
      >
        <circle cx="12" cy="12" r="10.5" fill="#fff" stroke="#111" strokeWidth="1.2" />
        <path d="M12 7.2 8.4 9.8l1.4 4.3h4.4l1.4-4.3z" fill="#111" />
        <path d="M12 1.5v5.7M2.4 9.4 8.4 9.8M21.6 9.4 15.6 9.8M6 20.4 9.8 14.1M18 20.4 14.2 14.1" stroke="#111" strokeWidth="1.2" />
      </svg>
      {/* The net it ends up in; it bulges when the page lands. */}
      <svg
        viewBox="0 0 14 24"
        className={`absolute top-0 right-0 h-6 w-[14px] ${progress >= 100 ? "net-ripple" : ""}`}
        fill="none"
        stroke="var(--pitch)"
        strokeWidth="1"
        style={{ transformOrigin: "right center", opacity: 0.85 }}
      >
        <path d="M1 0v23h12" strokeWidth="1.6" />
        <path d="M5 0v23M9 0v23M1 6h12M1 12h12M1 18h12" opacity="0.55" />
      </svg>
    </div>
  )
}

