import crypto from "crypto"
import { NextResponse } from "next/server"

export const LIVE_SESSION_COOKIE_NAME = "footyy_live_session"
export const SESSION_MAX_AGE_SECONDS = 12 * 3600 // 12 hours (43,200 seconds)

// Rate limiting state: in-memory IP tracking
interface RateLimitEntry {
  attempts: number
  lockUntil: number
  windowStart: number
}

const rateLimitMap = new Map<string, RateLimitEntry>()
export const MAX_FAILED_ATTEMPTS = 5
export const LOCKOUT_DURATION_MS = 5 * 60 * 1000 // 5 minutes
export const WINDOW_DURATION_MS = 5 * 60 * 1000 // 5 minutes

/** Retrieve the configured password, supporting both LIVE_ACCESS_PASSWORD and live_password */
export function getLivePassword(): string {
  return (
    process.env.LIVE_ACCESS_PASSWORD ||
    process.env.live_password ||
    "5589"
  )
}

/** Secret key used to sign session cookies with HMAC-SHA256 */
function getSecretKey(): string {
  const pw = getLivePassword()
  const salt = process.env.SUPABASE_JWT_SECRET || "footyy-live-secret-salt-2026"
  return crypto.createHash("sha256").update(`${pw}:${salt}`).digest("hex")
}

/** Parse a specific cookie value from a raw Cookie header string */
export function parseCookieHeader(cookieHeader: string | null, cookieName: string): string | null {
  if (!cookieHeader) return null
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${cookieName}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

/** Generate an HMAC-signed session token valid for 12 hours */
export function createSessionToken(customTtlSeconds = SESSION_MAX_AGE_SECONDS): string {
  const expiresAt = Date.now() + customTtlSeconds * 1000
  const sig = crypto
    .createHmac("sha256", getSecretKey())
    .update(expiresAt.toString())
    .digest("hex")
  return `${expiresAt}.${sig}`
}

/** Verify signature and expiry timestamp of a session token */
export function verifySessionToken(token: string | null | undefined): boolean {
  if (!token || typeof token !== "string") return false
  const parts = token.split(".")
  if (parts.length !== 2) return false

  const expiresAt = Number(parts[0])
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Date.now()) {
    return false
  }

  // Reject tokens exceeding max allowed lifetime (+10s leeway for drift)
  if (expiresAt - Date.now() > (SESSION_MAX_AGE_SECONDS + 10) * 1000) {
    return false
  }

  const expectedSig = crypto
    .createHmac("sha256", getSecretKey())
    .update(parts[0])
    .digest("hex")

  const bufActual = Buffer.from(parts[1])
  const bufExpected = Buffer.from(expectedSig)

  if (bufActual.length !== bufExpected.length) return false
  return crypto.timingSafeEqual(bufActual, bufExpected)
}

/** Check rate limiting for a client IP */
export function checkRateLimit(ip: string): {
  allowed: boolean
  remainingAttempts: number
  retryAfterSeconds: number
} {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)

  if (!entry) {
    return { allowed: true, remainingAttempts: MAX_FAILED_ATTEMPTS, retryAfterSeconds: 0 }
  }

  // Check if currently locked out
  if (now < entry.lockUntil) {
    const retryAfterSeconds = Math.ceil((entry.lockUntil - now) / 1000)
    return { allowed: false, remainingAttempts: 0, retryAfterSeconds }
  }

  // Check if sliding window has expired
  if (now - entry.windowStart > WINDOW_DURATION_MS) {
    rateLimitMap.delete(ip)
    return { allowed: true, remainingAttempts: MAX_FAILED_ATTEMPTS, retryAfterSeconds: 0 }
  }

  const remaining = Math.max(0, MAX_FAILED_ATTEMPTS - entry.attempts)
  return { allowed: remaining > 0, remainingAttempts: remaining, retryAfterSeconds: 0 }
}

/** Record a failed password attempt */
export function recordFailedAttempt(ip: string): { locked: boolean; retryAfterSeconds: number } {
  const now = Date.now()
  let entry = rateLimitMap.get(ip)

  if (!entry || now - entry.windowStart > WINDOW_DURATION_MS) {
    entry = { attempts: 1, lockUntil: 0, windowStart: now }
    rateLimitMap.set(ip, entry)
    return { locked: false, retryAfterSeconds: 0 }
  }

  entry.attempts += 1
  if (entry.attempts >= MAX_FAILED_ATTEMPTS) {
    entry.lockUntil = now + LOCKOUT_DURATION_MS
    const retryAfterSeconds = Math.ceil(LOCKOUT_DURATION_MS / 1000)
    return { locked: true, retryAfterSeconds }
  }

  return { locked: false, retryAfterSeconds: 0 }
}

/** Reset rate limit records on successful authentication */
export function resetRateLimit(ip: string): void {
  rateLimitMap.delete(ip)
}

/** Timing-safe password validation */
export function validatePassword(input: unknown): { valid: boolean; error?: string } {
  if (typeof input !== "string" || !input.trim()) {
    return { valid: false, error: "Password is required." }
  }

  const expected = getLivePassword()
  const inputNorm = input.trim()

  const bufInput = Buffer.from(inputNorm)
  const bufExpected = Buffer.from(expected)

  const matches = bufInput.length === bufExpected.length && crypto.timingSafeEqual(bufInput, bufExpected)

  if (!matches) {
    return { valid: false, error: "Incorrect password. Please try again." }
  }

  return { valid: true }
}

/** Extract client IP address from request headers */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")
  if (forwarded) {
    return forwarded.split(",")[0].trim()
  }
  const realIp = request.headers.get("x-real-ip")
  if (realIp) return realIp.trim()
  return "127.0.0.1"
}

/**
 * Enforce live authentication on API endpoints.
 * Returns HTTP 401 if unauthenticated, or null if authorized.
 */
export function requireLiveAuth(request: Request): NextResponse | null {
  const cookieHeader = request.headers.get("cookie")
  const token = parseCookieHeader(cookieHeader, LIVE_SESSION_COOKIE_NAME)

  if (!verifySessionToken(token)) {
    return NextResponse.json(
      {
        error: "Unauthorized",
        message: "Live section authentication required. Please unlock at /live.",
      },
      {
        status: 401,
        headers: {
          "WWW-Authenticate": 'Custom realm="footyy-live"',
        },
      }
    )
  }

  return null
}

