import { Suspense } from "react"
import { cookies } from "next/headers"
import { connection } from "next/server"
import { supabase } from "@/lib/supabase"
import { verifySessionToken, LIVE_SESSION_COOKIE_NAME } from "@/lib/live/auth"
import { LivePasswordLock } from "@/components/live-password-lock"
import { WatchStudio } from "@/components/watch-studio"
import type { LiveFixture } from "@/components/live-sections"
import type { StreamingProviderId } from "@/lib/streaming/types"
import { Skeleton } from "@/components/ui/skeleton"

export const metadata = {
  title: "Watch Live Stream — FOOTYY",
  description: "Live football broadcast and streaming center with synchronized match statistics.",
}

type PageProps = {
  searchParams: Promise<{
    id?: string
    event_id?: string
    channel?: string
    provider?: string
    source?: string
  }>
}

async function WatchContent({ searchParams }: PageProps) {
  await connection()
  const params = await searchParams
  const fixtureIdRaw = params.id ?? params.event_id
  const channelId = params.channel
  const provider = params.provider as StreamingProviderId | undefined
  const source = params.source

  // Authenticate Live section access
  const cookieStore = await cookies()
  const token = cookieStore.get(LIVE_SESSION_COOKIE_NAME)?.value
  const isAuthenticated = verifySessionToken(token)

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] py-12">
        <LivePasswordLock />
      </div>
    )
  }

  let fixture: LiveFixture | null = null
  let similarMatches: LiveFixture[] = []

  const from = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
  const to = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)

  // 1. Fetch requested fixture if ID is provided
  if (fixtureIdRaw) {
    const eventId = Number(fixtureIdRaw)
    if (!Number.isNaN(eventId) && eventId > 0) {
      const { data } = await supabase
        .from("matches")
        .select("event_id, date, kickoff, league, home, home_id, away, away_id, round, status, home_goals, away_goals")
        .eq("event_id", eventId)
        .maybeSingle()

      if (data) {
        fixture = {
          ...(data as unknown as LiveFixture),
          kickoff: data.kickoff ?? null,
        }
      }
    }
  }

  // 2. Fetch similar / related matches in current window
  const { data: similarData } = await supabase
    .from("matches")
    .select("event_id, date, kickoff, league, home, home_id, away, away_id, status, home_goals, away_goals")
    .neq("event_id", fixture?.event_id ?? 0)
    .gte("date", from)
    .lte("date", to)
    .order("date", { ascending: true })
    .limit(8)

  if (similarData) {
    similarMatches = (similarData as unknown as LiveFixture[]).map((m) => ({
      ...m,
      kickoff: m.kickoff ?? null,
    }))
  }

  return (
    <WatchStudio
      fixture={fixture}
      similarMatches={similarMatches}
      initialProvider={provider}
      initialSource={source}
      initialChannelId={channelId}
    />
  )
}

export default function WatchPage(props: PageProps) {
  return (
    <main className="mx-auto max-w-7xl px-3 sm:px-6 py-4 sm:py-8 min-h-screen">
      <Suspense
        fallback={
          <div className="flex flex-col gap-6 animate-pulse">
            <Skeleton className="h-10 w-48 rounded-full" />
            <Skeleton className="h-28 rounded-3xl" />
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <Skeleton className="lg:col-span-8 aspect-video rounded-3xl" />
              <Skeleton className="lg:col-span-4 h-96 rounded-3xl" />
            </div>
          </div>
        }
      >
        <WatchContent {...props} />
      </Suspense>
    </main>
  )
}

