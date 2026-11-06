import { NextResponse } from "next/server"
import { fetchDamiTvStreamById } from "@/lib/damitv/client"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ streamId: string }> },
) {
  try {
    const { streamId } = await params
    if (!streamId) {
      return NextResponse.json({ error: "streamId is required" }, { status: 400 })
    }

    const stream = await fetchDamiTvStreamById(streamId)
    if (!stream) {
      return NextResponse.json({ error: "Stream not found" }, { status: 404 })
    }

    return NextResponse.json(
      { stream },
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
    console.error("[damitv] Single stream API error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
