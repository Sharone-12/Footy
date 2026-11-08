"use client"

import { usePathname } from "next/navigation"
import { SlidingSegment } from "@/components/sliding-segment"

const TABS = [
  { key: "squad", label: "Squad", href: "/squad" },
  { key: "fixtures", label: "Fixtures", href: "/squad/fixtures" },
  { key: "leaders", label: "Leaders", href: "/squad/leaders" },
]

/** Section nav for the Barça pages, sitting under the page header. */
export function BarcaNav() {
  const pathname = usePathname()
  // Derived from TABS, never hardcoded: a tab added above has to light up
  // here too. slice(1) skips "squad" because /squad prefixes every other
  // href, so it would always match first.
  const active =
    TABS.slice(1).find((t) => pathname.startsWith(t.href))?.key ?? "squad"

  return <SlidingSegment ariaLabel="Barça section" activeKey={active} items={TABS} />
}
