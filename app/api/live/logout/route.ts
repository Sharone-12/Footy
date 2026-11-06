import { NextResponse } from "next/server"
import { LIVE_SESSION_COOKIE_NAME } from "@/lib/live/auth"

export async function POST() {
  const res = NextResponse.json({ success: true, message: "Logged out" })

  res.cookies.set({
    name: LIVE_SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  })

  return res
}

