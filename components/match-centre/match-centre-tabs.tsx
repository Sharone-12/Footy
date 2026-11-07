"use client"

import { useState, useEffect } from "react"
import { BarChart3Icon, UsersIcon, TrophyIcon, HistoryIcon, ActivityIcon } from "lucide-react"
import type { LiveFixture } from "@/components/live-sections"
import type { LiveScore } from "@/lib/livescores"
import { WatchLiveStatsCard } from "@/components/watch-live-stats"
import { PitchLineup } from "./pitch-lineup"
import { TableStandings } from "./table-standings"
import { H2HHistory } from "./h2h-history"
import type { MatchLineupsResponse } from "@/app/api/livescores/lineups/route"
import type { LeagueTableResponse } from "@/app/api/livescores/table/route"
import type { H2HResponse } from "@/app/api/livescores/h2h/route"

export type MatchCentreTab = "stats" | "lineups" | "table" | "h2h"

export type MatchCentreTabsProps = {
  fixture: LiveFixture
  liveScore?: LiveScore | null
  initialTab?: MatchCentreTab
}

export function MatchCentreTabs({ fixture, liveScore, initialTab = "stats" }: MatchCentreTabsProps) {
  const [activeTab, setActiveTab] = useState<MatchCentreTab>(initialTab)

  // Sub-data states
  const [lineups, setLineups] = useState<MatchLineupsResponse | null>(null)
  const [tableData, setTableData] = useState<LeagueTableResponse | null>(null)
  const [h2hData, setH2HData] = useState<H2HResponse | null>(null)

  const [isLoadingLineups, setIsLoadingLineups] = useState(false)
  const [isLoadingTable, setIsLoadingTable] = useState(false)
  const [isLoadingH2H, setIsLoadingH2H] = useState(false)

  const eid = liveScore?.id || null
  const fixtureId = fixture.event_id

  // Fetch lineups when line-ups tab is selected
  useEffect(() => {
    if (activeTab === "lineups" && !lineups && !isLoadingLineups) {
      setIsLoadingLineups(true)
      const param = eid ? `eid=${encodeURIComponent(eid)}` : `fixture_id=${encodeURIComponent(fixtureId)}`
      fetch(`/api/livescores/lineups?${param}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data) setLineups(data)
        })
        .catch(() => {})
        .finally(() => setIsLoadingLineups(false))
    }
  }, [activeTab, lineups, isLoadingLineups, eid, fixtureId])

  // Fetch table when table tab is selected
  useEffect(() => {
    if (activeTab === "table" && !tableData && !isLoadingTable) {
      setIsLoadingTable(true)
      const param = eid ? `eid=${encodeURIComponent(eid)}` : `fixture_id=${encodeURIComponent(fixtureId)}`
      fetch(`/api/livescores/table?${param}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data) setTableData(data)
        })
        .catch(() => {})
        .finally(() => setIsLoadingTable(false))
    }
  }, [activeTab, tableData, isLoadingTable, eid, fixtureId])

  // Fetch H2H when h2h tab is selected
  useEffect(() => {
    if (activeTab === "h2h" && !h2hData && !isLoadingH2H) {
      setIsLoadingH2H(true)
      const param = eid ? `eid=${encodeURIComponent(eid)}` : `fixture_id=${encodeURIComponent(fixtureId)}`
      fetch(`/api/livescores/h2h?${param}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data) setH2HData(data)
        })
        .catch(() => {})
        .finally(() => setIsLoadingH2H(false))
    }
  }, [activeTab, h2hData, isLoadingH2H, eid, fixtureId])

  return (
    <section aria-label="Match Centre Live Data" className="flex flex-col gap-3">
      {/* Tab Navigation Bar - Styled matching LiveScores tabs bar */}
      <div className="flex items-center gap-1 sm:gap-2 border-b border-white/10 pb-1 overflow-x-auto no-scrollbar select-none">
        <button
          type="button"
          onClick={() => setActiveTab("stats")}
          className={`relative px-3.5 sm:px-5 py-2 text-xs sm:text-sm font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === "stats"
              ? "text-white"
              : "text-white/50 hover:text-white/80"
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
          onClick={() => setActiveTab("lineups")}
          className={`relative px-3.5 sm:px-5 py-2 text-xs sm:text-sm font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === "lineups"
              ? "text-white"
              : "text-white/50 hover:text-white/80"
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
          onClick={() => setActiveTab("table")}
          className={`relative px-3.5 sm:px-5 py-2 text-xs sm:text-sm font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === "table"
              ? "text-white"
              : "text-white/50 hover:text-white/80"
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
          onClick={() => setActiveTab("h2h")}
          className={`relative px-3.5 sm:px-5 py-2 text-xs sm:text-sm font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === "h2h"
              ? "text-white"
              : "text-white/50 hover:text-white/80"
          }`}
        >
          <HistoryIcon className="size-3.5 sm:size-4" />
          <span>H2H</span>
          {activeTab === "h2h" && (
            <span className="absolute bottom-[-5px] inset-x-2 h-0.5 bg-[var(--pitch)] rounded-full shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
          )}
        </button>
      </div>

      {/* Active Tab Content Panel */}
      <div className="pt-1">
        {activeTab === "stats" && (
          <WatchLiveStatsCard fixture={fixture} liveScore={liveScore} />
        )}

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
