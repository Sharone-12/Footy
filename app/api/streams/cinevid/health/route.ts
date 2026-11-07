import { NextResponse } from "next/server"
import { checkCinevidHealth } from "@/lib/cinevid/client"
import { requireLiveAuth } from "@/lib/live/auth"

export async function GET(request: Request) {
  const authError = requireLiveAuth(request)
  if (authError) return authError

  try {
    const health = await checkCinevidHealth()
    return NextResponse.json(health, {
      status: health.ok ? 200 : 503,
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=15",
      },
    })
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
    console.error("[cinevid] Health check error:", err)
    return NextResponse.json({ status: "error", ok: false }, { status: 500 })
  }
}

