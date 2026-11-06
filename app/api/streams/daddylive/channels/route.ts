import { NextResponse } from "next/server"
import { fetchDaddyLiveChannels } from "@/lib/daddylive/client"
import { requireLiveAuth } from "@/lib/live/auth"

export async function GET(request: Request) {
  const authError = requireLiveAuth(request)
  if (authError) return authError

  try {
    const channels = await fetchDaddyLiveChannels()
    return NextResponse.json(
      {
        count: channels.length,
        channels,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=900, stale-while-revalidate=60",
        },
      },
    )
  } catch (err: unknown) {
    if (
      err &&
      typeof err === "object" &&
      "digest" in err &&
      typeof (err as { digest: unknown }).digest === "string" &&
      ((err as { digest: string }).digest.startsWith("NEXT_") ||
        (err as { digest: string }).digest === "DYNAMIC_SERVER_USAGE")
    ) {
      throw err
    }
    console.error("[daddylive] Channels API error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

