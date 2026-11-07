"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useLayoutEffect, useRef, useState } from "react"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"

const LINKS = [
  { href: "/", label: "Players", hint: "Top scorers & assists" },
  { href: "/teams", label: "Teams", hint: "Standings & power rankings" },
  { href: "/signals", label: "Signals", hint: "Derived metrics only we track" },
  { href: "/predictions", label: "Predict", hint: "Match predictions" },
  { href: "/compare", label: "Compare", hint: "Side-by-side player stats" },
  { href: "/squad", label: "Barça", hint: "The Barça squad" },
  { href: "/live", label: "Live", hint: "Live & streaming" },
]

/**
 * One row on desktop, wrapped on a phone.
 *
 * Seven tabs need 468px and a phone gives 296-406px, so the strip used to
 * scroll horizontally with no scrollbar. On /live — the last tab — it sat
 * pinned at the far end, which left Players and Teams off the left edge with
 * nothing on screen to say they were there. Wrapping shows all seven.
 */
const STRIP_CLASS =
  "segment relative flex flex-wrap md:flex-nowrap justify-center gap-0.5 rounded-2xl md:rounded-full p-1 whitespace-nowrap max-w-full"

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/"
  return pathname === href || pathname.startsWith(`${href}/`)
}

/**
 * SSR fallback — same shape as MainNav but with no active pill (needs
 * usePathname, which blocks prerender under Next 16 Cache Components).
 * Rendered until the client component streams in.
 */
export function MainNavFallback() {
  return (
    <div className={STRIP_CLASS}>
      {LINKS.map((l) => (
        <span
          key={l.href}
          className={`relative z-10 px-3 sm:px-4 py-1 sm:py-1.5 rounded-full text-xs sm:text-sm font-medium shrink-0 ${
            l.href === "/squad"
              ? "barca-stripes barca-stripes-tight overflow-hidden text-white font-bold min-w-[4.75rem] sm:min-w-[5.25rem] inline-flex items-center justify-center text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]"
              : "text-muted-foreground"
          }`}
        >
          <span className={l.href === "/squad" ? "drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]" : undefined}>
            {l.label}
          </span>
        </span>
      ))}
    </div>
  )
}

type Pill = { x: number; y: number; w: number; h: number }

/** Where the hover/active pill sits, relative to the strip's border box. */
function measure(
  container: HTMLDivElement,
  el: HTMLElement,
  setPill: (p: Pill) => void,
) {
  const cRect = container.getBoundingClientRect()
  const eRect = el.getBoundingClientRect()
  setPill({
    x: eRect.left - cRect.left,
    y: eRect.top - cRect.top,
    w: eRect.width,
    h: eRect.height,
  })
}

export function MainNav() {
  const pathname = usePathname()
  const containerRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Array<HTMLAnchorElement | null>>([])
  const [pill, setPill] = useState<Pill | null>(null)
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

  const activeIdx = LINKS.findIndex((l) => isActive(pathname, l.href))
  const targetIdx = hoveredIdx ?? activeIdx

  // Measure after layout so the pill lands on the right item on first paint
  // and re-measures on route change or window resize.
  useLayoutEffect(() => {
    const container = containerRef.current
    const el = itemRefs.current[targetIdx]
    if (!container || !el) {
      setPill(null)
      return
    }
    measure(container, el, setPill)
  }, [targetIdx, pathname])

  useLayoutEffect(() => {
    function onResize() {
      const container = containerRef.current
      const el = itemRefs.current[targetIdx]
      if (container && el) measure(container, el, setPill)
    }
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [targetIdx])

  return (
    <div
      ref={containerRef}
      className={STRIP_CLASS}
      onMouseLeave={() => setHoveredIdx(null)}
    >
      {pill && (
        <span
          aria-hidden
          className="absolute top-0 left-0 rounded-full bg-white/[0.08] shadow-[inset_0_1px_0_oklch(1_0_0_/_14%)] transition-[transform,width,height] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] pointer-events-none"
          style={{
            transform: `translate(${pill.x}px, ${pill.y}px)`,
            width: pill.w,
            height: pill.h,
          }}
        />
      )}
      {LINKS.map((l, i) => {
        const active = i === activeIdx
        const isBarca = l.href === "/squad"
        return (
          <Tooltip key={l.href}>
            <TooltipTrigger
              render={
                <Link
                  ref={(el) => {
                    itemRefs.current[i] = el
                  }}
                  href={l.href}
                  onMouseEnter={() => setHoveredIdx(i)}
                  onFocus={() => setHoveredIdx(i)}
                  onBlur={() => setHoveredIdx(null)}
                  data-active={active || undefined}
                  className={`relative z-10 px-3 sm:px-4 py-1 sm:py-1.5 rounded-full text-xs sm:text-sm font-medium transition-all duration-200 shrink-0 ${
                    isBarca
                      ? "barca-stripes barca-stripes-tight overflow-hidden text-white font-bold min-w-[4.75rem] sm:min-w-[5.25rem] inline-flex items-center justify-center text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_2px_6px_rgba(0,0,0,0.5)] hover:brightness-110"
                      : "text-muted-foreground hover:text-foreground data-[active]:text-foreground"
                  }`}
                >
                  <span className={isBarca ? "drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]" : undefined}>
                    {l.label}
                  </span>
                </Link>
              }
            />
            <TooltipContent sideOffset={8}>{l.hint}</TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}
