"use client"

import { useEffect, useState, useTransition } from "react"
import { ActivityIcon, CheckCircle2Icon, RefreshCwIcon, ShieldCheckIcon } from "lucide-react"
import { isProviderEnabled, STREAMING_PROVIDERS_CONFIG } from "@/lib/streaming/config"

interface ProviderStatus {
  id: string
  name: string
  status: "operational" | "degraded" | "down"
  ok: boolean
  latencyMs: number
  itemCount?: number
  message?: string
}

interface NetworkHealthData {
  timestamp: number
  overall: "operational" | "degraded" | "down"
  activeCount: number
  totalCount: number
  providers: ProviderStatus[]
}

const DEFAULT_PROVIDERS: ProviderStatus[] = [
  {
    id: "matchora",
    name: "Matchora",
    status: isProviderEnabled("matchora") ? "operational" : "degraded",
    ok: isProviderEnabled("matchora"),
    latencyMs: isProviderEnabled("matchora") ? 140 : 0,
    message: isProviderEnabled("matchora") ? undefined : "Disabled via config",
  },
  {
    id: "damitv",
    name: "DAMITV",
    status: isProviderEnabled("damitv") ? "operational" : "degraded",
    ok: isProviderEnabled("damitv"),
    latencyMs: isProviderEnabled("damitv") ? 220 : 0,
    message: isProviderEnabled("damitv") ? undefined : "Disabled via config",
  },
  {
    id: "cinevid",
    name: "Cinevid",
    status: isProviderEnabled("cinevid") ? "operational" : "degraded",
    ok: isProviderEnabled("cinevid"),
    latencyMs: isProviderEnabled("cinevid") ? 180 : 0,
    message: isProviderEnabled("cinevid") ? undefined : "Disabled via config",
  },
  {
    id: "daddylive",
    name: "DaddyLiveHD",
    status: isProviderEnabled("daddylive") ? "operational" : "degraded",
    ok: isProviderEnabled("daddylive"),
    latencyMs: isProviderEnabled("daddylive") ? 250 : 0,
    message: isProviderEnabled("daddylive") ? undefined : "Disabled via config",
  },
  {
    id: "streamfree",
    name: "StreamFree",
    status: isProviderEnabled("streamfree") ? "operational" : "degraded",
    ok: isProviderEnabled("streamfree"),
    latencyMs: 0,
    message: isProviderEnabled("streamfree") ? undefined : "Disabled via config",
  },
  {
    id: "zlive",
    name: "ZLive",
    status: isProviderEnabled("zlive") ? "operational" : "degraded",
    ok: isProviderEnabled("zlive"),
    latencyMs: isProviderEnabled("zlive") ? 160 : 0,
    message: isProviderEnabled("zlive") ? undefined : "Disabled via config",
  },
  {
    id: "live24",
    name: "Live24",
    status: isProviderEnabled("live24") ? "operational" : "degraded",
    ok: isProviderEnabled("live24"),
    latencyMs: isProviderEnabled("live24") ? 190 : 0,
    message: isProviderEnabled("live24") ? undefined : "Disabled via config",
  },
]

export function StreamingNetworkHealth() {
  const [data, setData] = useState<NetworkHealthData>({
    timestamp: Date.now(),
    overall: DEFAULT_PROVIDERS.filter((p) => p.ok).length === DEFAULT_PROVIDERS.length ? "operational" : "degraded",
    activeCount: DEFAULT_PROVIDERS.filter((p) => p.ok).length,
    totalCount: DEFAULT_PROVIDERS.length,
    providers: DEFAULT_PROVIDERS,
  })
  const [isPending, startTransition] = useTransition()
  const [lastPingTime, setLastPingTime] = useState<string>("just now")

  const pingProviders = () => {
    startTransition(async () => {
      try {
        const res = await fetch("/api/streams/health")
        if (res.ok) {
          const json = await res.json()
          setData(json)
          setLastPingTime("just now")
        }
      } catch (err) {
        console.warn("[health] Network health ping failed:", err)
      }
    })
  }

  useEffect(() => {
    pingProviders()
    const timer = setInterval(() => {
      pingProviders()
    }, 60_000) // Re-ping every 60s automatically

    return () => clearInterval(timer)
  }, [])

  const isAllGood = data.overall === "operational"

  return (
    <section
      aria-label="Streaming Network Health"
      className="surface bg-card/75 border border-border/80 rounded-2xl p-4 sm:p-5 flex flex-col gap-4 shadow-sm transition-all"
    >
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/40 pb-3.5">
        <div className="flex items-start gap-3">
          <div className="relative flex size-3 mt-1 shrink-0">
            {isAllGood ? (
              <>
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--pitch)] opacity-75 motion-reduce:hidden" />
                <span className="relative inline-flex rounded-full size-3 bg-[var(--pitch)] shadow-[0_0_8px_var(--pitch)]" />
              </>
            ) : (
              <>
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75 motion-reduce:hidden" />
                <span className="relative inline-flex rounded-full size-3 bg-amber-400" />
              </>
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span
                className="text-sm font-bold uppercase tracking-wider text-foreground"
                style={{ fontFamily: "var(--font-condensed)" }}
              >
                Streaming Network Health
              </span>
              <span
                className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border ${
                  isAllGood
                    ? "bg-[var(--pitch)]/10 text-[var(--pitch)] border-[var(--pitch)]/30"
                    : "bg-amber-500/10 text-amber-400 border-amber-500/30"
                }`}
              >
                {data.activeCount}/{data.totalCount} Sources Active
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Automated health check monitoring live stream scraping engines and edge feeds.
            </p>
          </div>
        </div>

        {/* Action button */}
        <div className="flex items-center gap-3 shrink-0 self-end sm:self-auto">
          <button
            type="button"
            onClick={pingProviders}
            disabled={isPending}
            className="card-lift px-3 py-1.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 hover:border-white/20 text-xs font-semibold text-foreground flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
            title="Send real-time health ping to all 6 streaming engines"
          >
            <RefreshCwIcon className={`size-3 text-[var(--pitch)] ${isPending ? "animate-spin" : ""}`} />
            <span>{isPending ? "Pinging..." : "Ping Sources"}</span>
          </button>
        </div>
      </div>

      {/* Provider Health Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2 sm:gap-2.5">
        {data.providers.map((p) => {
          const isConfigEnabled = isProviderEnabled(p.id as any)
          const isHealthy = isConfigEnabled && p.ok && p.status === "operational"
          const isDisabled = !isConfigEnabled || p.message === "Disabled via config"
          return (
            <div
              key={p.id}
              className={`card-lift surface bg-background/50 hover:bg-background/80 border border-border/70 hover:border-border rounded-xl p-2.5 flex flex-col justify-between gap-2 transition-all ${
                isDisabled ? "opacity-60" : ""
              }`}
            >
              <div className="flex items-center justify-between gap-1.5">
                <span className="font-bold text-xs text-foreground truncate">{p.name}</span>
                <span className="relative flex size-2 shrink-0">
                  {isHealthy ? (
                    <span className="relative inline-flex rounded-full size-2 bg-[var(--pitch)] shadow-[0_0_6px_var(--pitch)]" />
                  ) : isDisabled ? (
                    <span className="relative inline-flex rounded-full size-2 bg-zinc-600 border border-zinc-500/50" />
                  ) : (
                    <span className="relative inline-flex rounded-full size-2 bg-amber-400" />
                  )}
                </span>
              </div>

              <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono">
                <span className="truncate">
                  {isDisabled
                    ? "Disabled"
                    : p.itemCount
                    ? `${p.itemCount} feeds`
                    : isHealthy
                    ? "Online"
                    : "Standby"}
                </span>
                {!isDisabled && p.latencyMs > 0 && (
                  <span className="text-[9px] px-1 rounded bg-white/[0.06] text-muted-foreground shrink-0">
                    {p.latencyMs}ms
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
