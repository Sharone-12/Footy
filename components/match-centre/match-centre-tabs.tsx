"use client"

import { useState, useEffect } from "react"
import {
  InfoIcon,
  ActivityIcon,
  BarChart3Icon,
  UsersIcon,
  TrophyIcon,
  HistoryIcon,
} from "lucide-react"
import type { LiveFixture } from "@/components/live-sections"
import type { LiveScore } from "@/lib/livescores"
import { WatchLiveStatsCard } from "@/components/watch-live-stats"
import { PitchLineup } from "./pitch-lineup"
import { TableStandings } from "./table-standings"
import { H2HHistory } from "./h2h-history"
import { MatchSummary } from "./match-summary"
import { MatchInfo } from "./match-info"
import type { MatchLineupsResponse } from "@/app/api/livescores/lineups/route"
import type { LeagueTableResponse } from "@/app/api/livescores/table/route"
import type { H2HResponse } from "@/app/api/livescores/h2h/route"
import type { MatchSummaryResponse } from "@/app/api/livescores/summary/route"

export type MatchCentreTab = "stats" | "summary" | "table" | "lineups" | "h2h" | "info"

export type MatchCentreTabsProps = {
  fixture: LiveFixture
  liveScore?: LiveScore | null
  initialTab?: MatchCentreTab
}

export function MatchCentreTabs({
  fixture,
  liveScore,
  initialTab = "stats",
}: MatchCentreTabsProps) {
  const [activeTab, setActiveTab] = useState<MatchCentreTab>(initialTab)

  // Sub-data states
  const [summaryData, setSummaryData] = useState<MatchSummaryResponse | null>(null)
  const [lineups, setLineups] = useState<MatchLineupsResponse | null>(null)
  const [tableData, setTableData] = useState<LeagueTableResponse | null>(null)
  const [h2hData, setH2HData] = useState<H2HResponse | null>(null)

  const [isLoadingSummary, setIsLoadingSummary] = useState(false)
  const [isLoadingLineups, setIsLoadingLineups] = useState(false)
  const [isLoadingTable, setIsLoadingTable] = useState(false)
  const [isLoadingH2H, setIsLoadingH2H] = useState(false)

  const eid = liveScore?.id || null
  const fixtureId = fixture.event_id

  /**
   * Every panel's data is fetched once, in parallel, as soon as the match
   * centre mounts — not when its tab is first clicked.
   *
   * Each of these routes resolves the fixture and then calls out to
   * livescore.com, so firing them together ensures the server-side caches
   * are warm by the time anything is clicked.
   */
  useEffect(() => {
    const param = eid
      ? `eid=${encodeURIComponent(eid)}`
      : `fixture_id=${encodeURIComponent(fixtureId)}`
    const ac = new AbortController()

    const load = async <T,>(
      path: string,
      setData: (v: T) => void,
      setLoading: (v: boolean) => void,
    ) => {
      setLoading(true)
      try {
        const res = await fetch(`/api/livescores/${path}?${param}`, { signal: ac.signal })
        if (res.ok) {
          const data = (await res.json()) as T
          if (data) setData(data)
        }
      } catch {
        // Aborted on unmount, or provider is down
      } finally {
        if (!ac.signal.aborted) setLoading(false)
      }
    }

    void Promise.all([
      load<MatchSummaryResponse>("summary", setSummaryData, setIsLoadingSummary),
      load<MatchLineupsResponse>("lineups", setLineups, setIsLoadingLineups),
      load<LeagueTableResponse>("table", setTableData, setIsLoadingTable),
      load<H2HResponse>("h2h", setH2HData, setIsLoadingH2H),
    ])

    return () => ac.abort()
  }, [eid, fixtureId])

  return (
    <section aria-label="Match Centre Live Data" className="flex flex-col gap-3">
      {/* Tab Navigation Bar - Stats first, then Summary, Table, Line-ups, H2H, and Info last */}
      <div className="flex items-center gap-1 sm:gap-2 border-b border-white/10 pb-1 overflow-x-auto no-scrollbar select-none">
        <button
          type="button"
          onClick={() => setActiveTab("stats")}
          className={`relative px-3 sm:px-4.5 py-2 text-xs sm:text-sm font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === "stats" ? "text-white" : "text-white/50 hover:text-white/80"
          }`}
        >
          <BarChart3Icon className="size-3.5 sm:size-4" />
          <span>Stats</span>
          {activeTab === "stats" && (
            <span className="absolute bottom-[-5px] inset-x-2 h-0.5 bg-[var(--pitch)] rounded-full shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("summary")}
          className={`relative px-3 sm:px-4.5 py-2 text-xs sm:text-sm font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === "summary" ? "text-white" : "text-white/50 hover:text-white/80"
          }`}
        >
          <ActivityIcon className="size-3.5 sm:size-4" />
          <span>Summary</span>
          {activeTab === "summary" && (
            <span className="absolute bottom-[-5px] inset-x-2 h-0.5 bg-[var(--pitch)] rounded-full shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("table")}
          className={`relative px-3 sm:px-4.5 py-2 text-xs sm:text-sm font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === "table" ? "text-white" : "text-white/50 hover:text-white/80"
          }`}
        >
          <TrophyIcon className="size-3.5 sm:size-4" />
          <span>Table</span>
          {activeTab === "table" && (
            <span className="absolute bottom-[-5px] inset-x-2 h-0.5 bg-[var(--pitch)] rounded-full shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("lineups")}
          className={`relative px-3 sm:px-4.5 py-2 text-xs sm:text-sm font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === "lineups" ? "text-white" : "text-white/50 hover:text-white/80"
          }`}
        >
          <UsersIcon className="size-3.5 sm:size-4" />
          <span>Line-ups</span>
          {activeTab === "lineups" && (
            <span className="absolute bottom-[-5px] inset-x-2 h-0.5 bg-[var(--pitch)] rounded-full shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("h2h")}
          className={`relative px-3 sm:px-4.5 py-2 text-xs sm:text-sm font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === "h2h" ? "text-white" : "text-white/50 hover:text-white/80"
          }`}
        >
          <HistoryIcon className="size-3.5 sm:size-4" />
          <span>H2H</span>
          {activeTab === "h2h" && (
            <span className="absolute bottom-[-5px] inset-x-2 h-0.5 bg-[var(--pitch)] rounded-full shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("info")}
          className={`relative px-3 sm:px-4.5 py-2 text-xs sm:text-sm font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === "info" ? "text-white" : "text-white/50 hover:text-white/80"
          }`}
        >
          <InfoIcon className="size-3.5 sm:size-4" />
          <span>Info</span>
          {activeTab === "info" && (
            <span className="absolute bottom-[-5px] inset-x-2 h-0.5 bg-[var(--pitch)] rounded-full shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
          )}
        </button>
      </div>

      {/* Active Tab Content Panel */}
      <div className="pt-1">
        {activeTab === "info" && (
          <div className="surface rounded-2xl bg-card p-3.5 sm:p-4 md:p-5 border border-border/70 shadow-sm animate-fade-in">
            <MatchInfo summaryData={summaryData} fixture={fixture} isLoading={isLoadingSummary} />
          </div>
        )}

        {activeTab === "summary" && (
          <div className="surface rounded-2xl bg-card p-3.5 sm:p-4 md:p-5 border border-border/70 shadow-sm animate-fade-in">
            <MatchSummary summaryData={summaryData} fixture={fixture} isLoading={isLoadingSummary} />
          </div>
        )}

        {/* Hidden rather than unmounted: this card owns its own fetch and
            poll, so unmounting threw those away and every return to the tab
            restarted from a spinner. */}
        <div className={activeTab === "stats" ? undefined : "hidden"}>
          <WatchLiveStatsCard fixture={fixture} liveScore={liveScore} summaryData={summaryData} />
        </div>

        {activeTab === "lineups" && (
          <div className="surface rounded-2xl bg-card p-3.5 sm:p-4 md:p-5 border border-border/70 shadow-sm animate-fade-in">
            <PitchLineup lineups={lineups} fixture={fixture} isLoading={isLoadingLineups} />
          </div>
        )}

        {activeTab === "table" && (
          <div className="surface rounded-2xl bg-card p-3.5 sm:p-4 md:p-5 border border-border/70 shadow-sm animate-fade-in">
            <TableStandings tableData={tableData} fixture={fixture} isLoading={isLoadingTable} />
          </div>
        )}

        {activeTab === "h2h" && (
          <div className="surface rounded-2xl bg-card p-3.5 sm:p-4 md:p-5 border border-border/70 shadow-sm animate-fade-in">
            <H2HHistory h2hData={h2hData} fixture={fixture} isLoading={isLoadingH2H} />
          </div>
        )}
      </div>
    </section>
  )
}
