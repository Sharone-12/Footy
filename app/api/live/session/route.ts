import { NextResponse } from "next/server"
import {
  verifySessionToken,
  parseCookieHeader,
  LIVE_SESSION_COOKIE_NAME,
} from "@/lib/live/auth"

export async function GET(request: Request) {
  const cookieHeader = request.headers.get("cookie")
  const token = parseCookieHeader(cookieHeader, LIVE_SESSION_COOKIE_NAME)
  const authenticated = verifySessionToken(token)

  return NextResponse.json({ authenticated })
}

