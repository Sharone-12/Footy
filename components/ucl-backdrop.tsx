"use client"

import { useSearchParams } from "next/navigation"
import { resolveCompetition } from "@/lib/competition"

/**
 * Champions League wallpaper behind the page in UCL mode. The data-on
 * attribute is what globals.css keys off to drop the nav's dark gradient,
 * which otherwise smears black over the top of the image.
 *
 * Two params mean UCL: ?comp=ucl everywhere, and /predictions' own
 * ?league=UCL filter, which predates it and doesn't write ?comp=.
 */
export function UclBackdrop() {
  const params = useSearchParams()
  const on =
    resolveCompetition(params.get("comp")) === "ucl" ||
    params.get("league") === "UCL"
  return (
    <div
      aria-hidden
      data-on={on}
      className="ucl-bg fixed inset-0 -z-10 bg-cover bg-center transition-opacity duration-700"
      style={{ backgroundImage: "url(/ucl-bg.png)", opacity: on ? 1 : 0 }}
    >
      {/* Just enough to keep body text readable over the bright blue. */}
      <div className="absolute inset-0 bg-background/35" />
    </div>
  )
}
