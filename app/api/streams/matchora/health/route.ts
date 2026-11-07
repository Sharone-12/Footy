import { NextResponse } from "next/server"
import { checkMatchoraHealth } from "@/lib/matchora/client"

export async function GET(request: Request) {
  try {
    const health = await checkMatchoraHealth()
    return NextResponse.json(
      {
        provider: "matchora",
        ...health,
      },
      {
        status: health.ok ? 200 : 503,
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=15",
        },
      },
    )
  } catch (err) {
    return NextResponse.json({ status: "error", ok: false }, { status: 500 })
  }
}
