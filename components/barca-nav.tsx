"use client"

import { usePathname } from "next/navigation"
import { SlidingSegment } from "@/components/sliding-segment"

const TABS = [
  { key: "squad", label: "Squad", href: "/squad" },
  { key: "fixtures", label: "Fixtures", href: "/squad/fixtures" },
  { key: "stream", label: "Stream", href: "/squad/stream" },
]

/** Section nav for the Barça pages, sitting under the page header. */
export function BarcaNav() {
  const pathname = usePathname()
  const active =
    TABS.slice(1).find((t) => pathname.startsWith(t.href))?.key ?? "squad"

  return <SlidingSegment ariaLabel="Barça section" activeKey={active} items={TABS} />
}
