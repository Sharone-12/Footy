import { Suspense } from "react"
import { supabase } from "@/lib/supabase"
import { BARCA_ID, LEAGUE_TOURNAMENT_ID } from "@/lib/teams"
import { discover } from "@/lib/providers/discover"
import { TeamCrest, LeagueCrest } from "@/components/player-avatar"
import { StreamProviders } from "@/components/stream-providers"
import { ExternalSources } from "@/components/external-sources"
import { BarcaNav } from "@/components/barca-nav"
import { Skeleton } from "@/components/ui/skeleton"

const BARCA = "FC Barcelona"

type Row = {
  event_id: number
  date: string
  kickoff: string | null
  league: string
  home: string
  home_id: number | null
  away: string
  away_id: number | null
}

function formatDate(iso: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  })
}

async function Stream() {
  const { data } = await supabase
    .from("matches")
    .select("event_id, date, kickoff, league, home, home_id, away, away_id")
    .eq("status", "upcoming")
    .or(`home_id.eq.${BARCA_ID},away_id.eq.${BARCA_ID}`)
    .order("date", { ascending: true })
    .limit(1)

  const m = (data || [])[0] as Row | undefined
  if (!m) return <p className="text-muted-foreground">No upcoming Barça match.</p>

  const atHome = m.home_id === BARCA_ID
  const opponent = atHome ? m.away : m.home
  const opponentId = atHome ? m.away_id : m.home_id
  const tid = LEAGUE_TOURNAMENT_ID[m.league]
  // Cached and de-duplicated against the timer's pre-kickoff fetch, so this
  // render shares one provider fan-out with /api/streams.
  const discovered = await discover(m)

  return (
    <>
      <div className="surface bg-card rounded-2xl px-5 py-4 mb-4 flex items-center gap-4">
        <span className="flex items-center gap-2.5 min-w-0 flex-1">
          <TeamCrest teamId={BARCA_ID} name={BARCA} size={32} />
          <span className="stat-label text-[0.6rem]">{atHome ? "vs" : "at"}</span>
          {opponentId != null && (
            <TeamCrest teamId={opponentId} name={opponent} size={32} />
          )}
          <span className="min-w-0">
            <span className="block font-semibold truncate">{opponent}</span>
            <span className="stat-label block text-xs">{formatDate(m.date)}</span>
          </span>
        </span>
        {tid && <LeagueCrest tournamentId={tid} name={m.league} size={24} />}
      </div>
      <StreamProviders result={discovered} title={`${m.home} v ${m.away}`} />
    </>
  )
}

export default function BarcaStreamPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-14">
      <div className="mb-6 flex items-center gap-3 animate-fade-in">
        <TeamCrest teamId={BARCA_ID} name={BARCA} size={40} />
        <div>
          <h1
            className="text-4xl sm:text-5xl font-bold tracking-[-0.035em] leading-none"
            style={{ fontFamily: "var(--font-condensed)" }}
          >
            STREAM
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            The next Barça match, played here when a provider offers an embeddable stream.
          </p>
        </div>
      </div>
      <div className="mb-6">
        <Suspense fallback={<Skeleton className="h-10 w-60 rounded-full" />}>
          <BarcaNav />
        </Suspense>
      </div>
      <Suspense
        fallback={
          <>
            <Skeleton className="h-[74px] rounded-2xl mb-4" />
            <Skeleton className="aspect-video rounded-2xl" />
          </>
        }
      >
        <Stream />
      </Suspense>

      {/* Same directory the Live page shows, rendered from the one registry
          in lib/providers/registry.ts — a destination added there appears on
          both pages without a component change. */}
      <section className="mt-12">
        <h2
          className="text-lg font-semibold tracking-tight uppercase mb-1"
          style={{ fontFamily: "var(--font-condensed)" }}
        >
          Available External Sources
        </h2>
        <p className="text-muted-foreground text-sm mb-4">
          Every link here opens in a new tab and leaves the app.
        </p>
        <ExternalSources />
      </section>
    </div>
  )
}
