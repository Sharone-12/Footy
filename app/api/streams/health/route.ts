import { NextResponse } from "next/server"
import { checkMatchoraHealth } from "@/lib/matchora/client"
import { checkDamiTvHealth } from "@/lib/damitv/client"
import { checkCinevidHealth } from "@/lib/cinevid/client"
import { checkDaddyLiveHealth } from "@/lib/daddylive/client"
import { checkStreamFreeHealth } from "@/lib/streamfree/client"
import { checkZLiveHealth } from "@/lib/zlive/client"
import { requireLiveAuth } from "@/lib/live/auth"

export interface ProviderHealthReport {
  id: string
  name: string
  status: "operational" | "degraded" | "down"
  ok: boolean
  latencyMs: number
  itemCount?: number
  message?: string
}

export async function GET(request: Request) {
  const authError = requireLiveAuth(request)
  if (authError) return authError

  const [moRes, dtRes, cvRes, dlRes, sfRes, zlRes] = await Promise.allSettled([
    checkMatchoraHealth(),
    checkDamiTvHealth(),
    checkCinevidHealth(),
    checkDaddyLiveHealth(),
    checkStreamFreeHealth(),
    checkZLiveHealth(),
  ])

  const reports: ProviderHealthReport[] = [
    {
      id: "matchora",
      name: "Matchora",
      ok: moRes.status === "fulfilled" && moRes.value.ok,
      status: moRes.status === "fulfilled" && moRes.value.ok ? "operational" : "degraded",
      latencyMs: moRes.status === "fulfilled" ? moRes.value.latencyMs : 0,
      itemCount: moRes.status === "fulfilled" ? moRes.value.count : undefined,
    },
    {
      id: "damitv",
      name: "DAMITV",
      ok: dtRes.status === "fulfilled" && dtRes.value.ok,
      status: dtRes.status === "fulfilled" && dtRes.value.ok ? "operational" : "degraded",
      latencyMs: dtRes.status === "fulfilled" ? dtRes.value.latencyMs ?? 0 : 0,
      itemCount: dtRes.status === "fulfilled" ? dtRes.value.streamCount : undefined,
    },
    {
      id: "cinevid",
      name: "Cinevid",
      ok: cvRes.status === "fulfilled" && cvRes.value.ok,
      status: cvRes.status === "fulfilled" && cvRes.value.ok ? "operational" : "degraded",
      latencyMs: cvRes.status === "fulfilled" ? cvRes.value.latencyMs : 0,
      itemCount: cvRes.status === "fulfilled" ? cvRes.value.count : undefined,
    },
    {
      id: "daddylive",
      name: "DaddyLiveHD",
      ok: dlRes.status === "fulfilled" && dlRes.value.ok,
      status: dlRes.status === "fulfilled" && dlRes.value.ok ? "operational" : "degraded",
      latencyMs: dlRes.status === "fulfilled" ? dlRes.value.latencyMs : 0,
      itemCount: dlRes.status === "fulfilled" ? dlRes.value.count : undefined,
    },
    {
      id: "streamfree",
      name: "StreamFree",
      ok: false,
      status: "degraded",
      latencyMs: 0,
      itemCount: 0,
      message: "Unwired for testing",
    },
    {
      id: "zlive",
      name: "ZLive",
      ok: zlRes.status === "fulfilled" && zlRes.value.ok,
      status: zlRes.status === "fulfilled" && zlRes.value.ok ? "operational" : "degraded",
      latencyMs: zlRes.status === "fulfilled" ? zlRes.value.latencyMs : 0,
      itemCount: zlRes.status === "fulfilled" ? zlRes.value.count : undefined,
    },
  ]

  const activeCount = reports.filter((r) => r.ok).length
  const overall = activeCount === reports.length ? "operational" : activeCount > 0 ? "degraded" : "down"

  return NextResponse.json(
    {
      timestamp: Date.now(),
      overall,
      activeCount,
      totalCount: reports.length,
      providers: reports,
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=15, stale-while-revalidate=10",
      },
    },
  )
}

