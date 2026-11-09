import { NextResponse } from "next/server"
import { checkMatchoraHealth } from "@/lib/matchora/client"
import { checkDamiTvHealth } from "@/lib/damitv/client"
import { checkCinevidHealth } from "@/lib/cinevid/client"
import { checkDaddyLiveHealth } from "@/lib/daddylive/client"
import { checkStreamFreeHealth } from "@/lib/streamfree/client"
import { checkZLiveHealth } from "@/lib/zlive/client"
import { checkLive24Health } from "@/lib/live24/client"
import { requireLiveAuth } from "@/lib/live/auth"
import { isProviderEnabled } from "@/lib/streaming/config"

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

  // Only run health pings for providers that are actually enabled in config
  const [moRes, dtRes, cvRes, dlRes, sfRes, zlRes, l24Res] = await Promise.allSettled([
    isProviderEnabled("matchora") ? checkMatchoraHealth() : Promise.resolve(null),
    isProviderEnabled("damitv") ? checkDamiTvHealth() : Promise.resolve(null),
    isProviderEnabled("cinevid") ? checkCinevidHealth() : Promise.resolve(null),
    isProviderEnabled("daddylive") ? checkDaddyLiveHealth() : Promise.resolve(null),
    isProviderEnabled("streamfree") ? checkStreamFreeHealth() : Promise.resolve(null),
    isProviderEnabled("zlive") ? checkZLiveHealth() : Promise.resolve(null),
    isProviderEnabled("live24") ? checkLive24Health() : Promise.resolve(null),
  ])

  const reports: ProviderHealthReport[] = [
    {
      id: "matchora",
      name: "Matchora",
      ok: isProviderEnabled("matchora") && moRes.status === "fulfilled" && Boolean(moRes.value?.ok),
      status: !isProviderEnabled("matchora")
        ? "degraded"
        : moRes.status === "fulfilled" && moRes.value?.ok
        ? "operational"
        : "degraded",
      latencyMs: isProviderEnabled("matchora") && moRes.status === "fulfilled" && moRes.value ? moRes.value.latencyMs : 0,
      itemCount: isProviderEnabled("matchora") && moRes.status === "fulfilled" && moRes.value ? moRes.value.count : 0,
      message: !isProviderEnabled("matchora") ? "Disabled via config" : undefined,
    },
    {
      id: "damitv",
      name: "DAMITV",
      ok: isProviderEnabled("damitv") && dtRes.status === "fulfilled" && Boolean(dtRes.value?.ok),
      status: !isProviderEnabled("damitv")
        ? "degraded"
        : dtRes.status === "fulfilled" && dtRes.value?.ok
        ? "operational"
        : "degraded",
      latencyMs: isProviderEnabled("damitv") && dtRes.status === "fulfilled" && dtRes.value ? dtRes.value.latencyMs ?? 0 : 0,
      itemCount: isProviderEnabled("damitv") && dtRes.status === "fulfilled" && dtRes.value ? dtRes.value.streamCount : 0,
      message: !isProviderEnabled("damitv") ? "Disabled via config" : undefined,
    },
    {
      id: "cinevid",
      name: "Cinevid",
      ok: isProviderEnabled("cinevid") && cvRes.status === "fulfilled" && Boolean(cvRes.value?.ok),
      status: !isProviderEnabled("cinevid")
        ? "degraded"
        : cvRes.status === "fulfilled" && cvRes.value?.ok
        ? "operational"
        : "degraded",
      latencyMs: isProviderEnabled("cinevid") && cvRes.status === "fulfilled" && cvRes.value ? cvRes.value.latencyMs : 0,
      itemCount: isProviderEnabled("cinevid") && cvRes.status === "fulfilled" && cvRes.value ? cvRes.value.count : 0,
      message: !isProviderEnabled("cinevid") ? "Disabled via config" : undefined,
    },
    {
      id: "daddylive",
      name: "DaddyLiveHD",
      ok: isProviderEnabled("daddylive") && dlRes.status === "fulfilled" && Boolean(dlRes.value?.ok),
      status: !isProviderEnabled("daddylive")
        ? "degraded"
        : dlRes.status === "fulfilled" && dlRes.value?.ok
        ? "operational"
        : "degraded",
      latencyMs: isProviderEnabled("daddylive") && dlRes.status === "fulfilled" && dlRes.value ? dlRes.value.latencyMs : 0,
      itemCount: isProviderEnabled("daddylive") && dlRes.status === "fulfilled" && dlRes.value ? dlRes.value.count : 0,
      message: !isProviderEnabled("daddylive") ? "Disabled via config" : undefined,
    },
    {
      id: "streamfree",
      name: "StreamFree",
      ok: isProviderEnabled("streamfree") && sfRes.status === "fulfilled" && Boolean(sfRes.value?.ok),
      status: !isProviderEnabled("streamfree")
        ? "degraded"
        : sfRes.status === "fulfilled" && sfRes.value?.ok
        ? "operational"
        : "degraded",
      latencyMs: isProviderEnabled("streamfree") && sfRes.status === "fulfilled" && sfRes.value ? sfRes.value.latencyMs : 0,
      itemCount: isProviderEnabled("streamfree") && sfRes.status === "fulfilled" && sfRes.value ? sfRes.value.count : 0,
      message: !isProviderEnabled("streamfree") ? "Disabled via config" : undefined,
    },
    {
      id: "zlive",
      name: "ZLive",
      ok: isProviderEnabled("zlive") && zlRes.status === "fulfilled" && Boolean(zlRes.value?.ok),
      status: !isProviderEnabled("zlive")
        ? "degraded"
        : zlRes.status === "fulfilled" && zlRes.value?.ok
        ? "operational"
        : "degraded",
      latencyMs: isProviderEnabled("zlive") && zlRes.status === "fulfilled" && zlRes.value ? zlRes.value.latencyMs : 0,
      itemCount: isProviderEnabled("zlive") && zlRes.status === "fulfilled" && zlRes.value ? zlRes.value.count : 0,
      message: !isProviderEnabled("zlive") ? "Disabled via config" : undefined,
    },
    {
      id: "live24",
      name: "Live24",
      ok: isProviderEnabled("live24") && l24Res.status === "fulfilled" && Boolean(l24Res.value?.ok),
      status: !isProviderEnabled("live24")
        ? "degraded"
        : l24Res.status === "fulfilled" && l24Res.value?.ok
        ? "operational"
        : "degraded",
      latencyMs: isProviderEnabled("live24") && l24Res.status === "fulfilled" && l24Res.value ? l24Res.value.latencyMs : 0,
      itemCount: isProviderEnabled("live24") && l24Res.status === "fulfilled" && l24Res.value ? l24Res.value.count : 0,
      message: !isProviderEnabled("live24") ? "Disabled via config" : undefined,
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
        "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300",
      },
    },
  )
}
