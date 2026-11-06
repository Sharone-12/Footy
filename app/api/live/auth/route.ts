import { NextResponse } from "next/server"
import {
  validatePassword,
  createSessionToken,
  checkRateLimit,
  recordFailedAttempt,
  resetRateLimit,
  getClientIp,
  LIVE_SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/live/auth"

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request)

    // 1. Rate limiting check
    const rateLimit = checkRateLimit(ip)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: `Too many failed attempts. Please try again in ${rateLimit.retryAfterSeconds} seconds.`,
          retryAfter: rateLimit.retryAfterSeconds,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimit.retryAfterSeconds),
          },
        }
      )
    }

    // 2. Parse request payload
    let body: { password?: unknown }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const { password } = body
    if (typeof password !== "string" || !password.trim()) {
      return NextResponse.json({ error: "Password is required" }, { status: 400 })
    }

    // 3. Password validation
    const result = validatePassword(password)
    if (!result.valid) {
      const fail = recordFailedAttempt(ip)
      if (fail.locked) {
        return NextResponse.json(
          {
            error: `Too many failed attempts. Locked out for ${fail.retryAfterSeconds} seconds.`,
            retryAfter: fail.retryAfterSeconds,
          },
          {
            status: 429,
            headers: {
              "Retry-After": String(fail.retryAfterSeconds),
            },
          }
        )
      }

      return NextResponse.json(
        {
          error: "Incorrect password. Please try again.",
        },
        { status: 401 }
      )
    }

    // 4. Authentication succeeded
    resetRateLimit(ip)
    const token = createSessionToken()

    const res = NextResponse.json({
      success: true,
      expiresIn: SESSION_MAX_AGE_SECONDS,
    })

    res.cookies.set({
      name: LIVE_SESSION_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    })

    return res
  } catch (err) {
    console.error("[live/auth] Auth error:", err)
    return NextResponse.json({ error: "Internal authentication error" }, { status: 500 })
  }
}

