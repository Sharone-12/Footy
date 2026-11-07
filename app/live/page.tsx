import { Suspense } from "react"
import { connection } from "next/server"
import { cookies } from "next/headers"
import { supabase } from "@/lib/supabase"
import { LiveSections, type LiveFixture } from "@/components/live-sections"
import { Skeleton } from "@/components/ui/skeleton"
import { LivePasswordLock } from "@/components/live-password-lock"
import { LiveLockControl } from "@/components/live-lock-control"
import { verifySessionToken, LIVE_SESSION_COOKIE_NAME } from "@/lib/live/auth"

const COLS = "event_id, date, league, home, home_id, away, away_id"

/** Enough to fill "Upcoming" without pulling a whole season into the page. */
const DAYS_AHEAD = 7
const LIMIT = 60

async function Fixtures() {
  await connection()
  // Yesterday, because a late kickoff is still in play after midnight UTC.
  const from = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
  const to = new Date(Date.now() + DAYS_AHEAD * 86_400_000).toISOString().slice(0, 10)

  const q = (cols: string) =>
    supabase
      .from("matches")
      .select(cols)
      .eq("status", "upcoming")
      .gte("date", from)
      .lte("date", to)
      .order("date", { ascending: true })
      .limit(LIMIT)

  // `kickoff` is a newer column; fall back rather than lose the page if the
  // database hasn't been migrated (same fallback as the fixtures list).
  let { data } = await q(`${COLS}, kickoff`)
  if (!data) ({ data } = await q(COLS))

  const matches = ((data || []) as unknown as LiveFixture[]).map((m) => ({
    ...m,
    kickoff: m.kickoff ?? null,
  }))

  return <LiveSections matches={matches} />
}

async function LiveAuthGate() {
  // Read session cookie server-side within the dynamic Suspense stream
  const cookieStore = await cookies()
  const token = cookieStore.get(LIVE_SESSION_COOKIE_NAME)?.value
  const isAuthenticated = verifySessionToken(token)

  // If not authenticated, render branded password unlock screen
  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh]">
        <LivePasswordLock />
      </div>
    )
  }

  // Once authenticated, render full Live section with Lock control
  return (
    <>
      <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 animate-fade-in">
        <div>
          <h1
            className="text-3xl sm:text-5xl font-bold tracking-[-0.035em] leading-none"
            style={{ fontFamily: "var(--font-condensed)" }}
          >
            LIVE &amp; STREAMING
          </h1>
          <p className="text-muted-foreground text-xs sm:text-sm mt-1.5 leading-snug">
            What&apos;s on now and next, from our own fixture data.
          </p>
        </div>
        <LiveLockControl />
      </div>

      <Suspense
        fallback={
          <div className="flex flex-col gap-2.5">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-[74px] rounded-2xl" />
            ))}
          </div>
        }
      >
        <Fixtures />
      </Suspense>
    </>
  )
}

export default function LivePage() {
  return (
    <div className="mx-auto max-w-5xl px-3 sm:px-4 py-6 sm:py-14">
      <Suspense
        fallback={
          <div className="flex flex-col gap-4">
            <Skeleton className="h-12 w-64 rounded-2xl" />
            <div className="flex flex-col gap-2.5 mt-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-[74px] rounded-2xl" />
              ))}
            </div>
          </div>
        }
      >
        <LiveAuthGate />
      </Suspense>
    </div>
  )
}
