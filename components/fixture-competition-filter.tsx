"use client"

import { useSearchParams } from "next/navigation"
import { SlidingSegment } from "@/components/sliding-segment"
import { FIXTURE_SCOPES, DEFAULT_FIXTURE_SCOPE, resolveFixtureScope } from "@/lib/squad"

/** All / League / UCL tabs for the fixture list. Rewrites ?comp= in place. */
export function FixtureCompetitionFilter() {
  const params = useSearchParams()
  const active = resolveFixtureScope(params.get("comp"))

  function hrefFor(key: string): string {
    const next = new URLSearchParams(params.toString())
    if (key === DEFAULT_FIXTURE_SCOPE) next.delete("comp")
    else next.set("comp", key)
    const qs = next.toString()
    return qs ? `/squad/fixtures?${qs}` : "/squad/fixtures"
  }

  return (
    <SlidingSegment
      ariaLabel="Competition"
      activeKey={active}
      items={FIXTURE_SCOPES.map((s) => ({
        key: s.key,
        label: s.label,
        href: hrefFor(s.key),
      }))}
    />
  )
}
