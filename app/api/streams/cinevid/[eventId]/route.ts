import { NextResponse } from "next/server"
import { fetchCinevidEventById } from "@/lib/cinevid/client"
import { requireLiveAuth } from "@/lib/live/auth"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const authError = requireLiveAuth(request)
  if (authError) return authError

  try {
    const { eventId } = await params
    if (!eventId) {
      return NextResponse.json({ error: "Missing eventId" }, { status: 400 })
    }

    const event = await fetchCinevidEventById(eventId)
    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 })
    }

    return NextResponse.json(
      {
        matched: true,
        event,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30",
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
    console.error("[cinevid] Event detail API error:", err)
    return NextResponse.json({ error: "Failed to fetch Cinevid event" }, { status: 500 })
  }
}
