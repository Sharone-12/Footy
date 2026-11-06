// Set fallback env vars before any modules load
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://dummy.supabase.co"
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "dummy-anon-key"
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://dummy.supabase.co"
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "dummy-service-role-key"

import assert from "node:assert/strict"

async function runIntegrationTests() {
  console.log("Starting live integration tests...")

  const { resetRateLimit, LIVE_SESSION_COOKIE_NAME } = await import("./auth")
  const { POST: authPost } = await import("@/app/api/live/auth/route")
  const { POST: logoutPost } = await import("@/app/api/live/logout/route")
  const { GET: sessionGet } = await import("@/app/api/live/session/route")
  const { GET: streamfreeGet } = await import("@/app/api/streamfree/route")
  const { GET: zliveGet } = await import("@/app/api/zlive/route")
  const { GET: damitvHealthGet } = await import("@/app/api/streams/damitv/health/route")

  const testIp = "10.0.0.99"
  resetRateLimit(testIp)

  // 1. Unauthenticated direct API access to live endpoints must return 401
  const reqUnauth = new Request("http://localhost:3000/api/streamfree")
  const resStreamfree401 = await streamfreeGet(reqUnauth)
  assert.equal(resStreamfree401.status, 401, "StreamFree without cookie must return 401")

  const resZlive401 = await zliveGet(new Request("http://localhost:3000/api/zlive"))
  assert.equal(resZlive401.status, 401, "ZLive without cookie must return 401")

  const resDamitv401 = await damitvHealthGet(new Request("http://localhost:3000/api/streams/damitv/health"))
  assert.equal(resDamitv401.status, 401, "DAMITV health without cookie must return 401")

  // 2. Empty password authentication attempt -> 400
  const reqEmpty = new Request("http://localhost:3000/api/live/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": testIp },
    body: JSON.stringify({ password: "" }),
  })
  const resEmpty = await authPost(reqEmpty)
  assert.equal(resEmpty.status, 400, "Empty password must return 400")

  // 3. Incorrect password -> 401
  const makeWrongReq = () =>
    new Request("http://localhost:3000/api/live/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": testIp },
      body: JSON.stringify({ password: "wrongpassword123" }),
    })

  const resWrong = await authPost(makeWrongReq())
  assert.equal(resWrong.status, 401, "Wrong password must return 401")

  // 4. Rate limiting: 4 more failed attempts (5 total) -> 429
  for (let i = 0; i < 3; i++) {
    await authPost(makeWrongReq())
  }
  const resFifthWrong = await authPost(makeWrongReq())
  assert.equal(resFifthWrong.status, 429, "5th failed attempt must return 429 Too Many Requests")

  // Reset rate limit for subsequent valid testing
  resetRateLimit(testIp)

  // 5. Correct password -> 200 and Set-Cookie
  const reqValid = new Request("http://localhost:3000/api/live/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": testIp },
    body: JSON.stringify({ password: "5589" }),
  })
  const resValid = await authPost(reqValid)
  assert.equal(resValid.status, 200, "Valid password must return 200")

  const setCookie = resValid.headers.get("set-cookie")
  assert.ok(setCookie, "Must set session cookie")
  assert.ok(setCookie.includes(LIVE_SESSION_COOKIE_NAME), "Cookie must have live session name")
  assert.ok(setCookie.includes("HttpOnly"), "Cookie must be HttpOnly")
  assert.ok(setCookie.includes("Max-Age=43200"), "Cookie must be 12 hours (43200s)")

  // Extract cookie token value
  const match = setCookie.match(new RegExp(`${LIVE_SESSION_COOKIE_NAME}=([^;]+)`))
  const cookieValue = match ? match[1] : ""
  assert.ok(cookieValue, "Extracted valid cookie token")

  // 6. Session endpoint with valid cookie -> authenticated: true
  const reqSession = new Request("http://localhost:3000/api/live/session", {
    headers: { cookie: `${LIVE_SESSION_COOKIE_NAME}=${cookieValue}` },
  })
  const resSession = await sessionGet(reqSession)
  const sessionData = await resSession.json()
  assert.equal(sessionData.authenticated, true, "Session endpoint must report authenticated")

  // 7. API request with valid cookie -> succeeds (does NOT return 401)
  const reqAuthedDamitv = new Request("http://localhost:3000/api/streams/damitv/health", {
    headers: { cookie: `${LIVE_SESSION_COOKIE_NAME}=${cookieValue}` },
  })
  const resAuthedDamitv = await damitvHealthGet(reqAuthedDamitv)
  assert.notEqual(resAuthedDamitv.status, 401, "Authed request to DAMITV health must not return 401")

  // 8. Logout endpoint -> clears cookie
  const resLogout = await logoutPost()
  assert.equal(resLogout.status, 200)
  const logoutCookie = resLogout.headers.get("set-cookie")
  assert.ok(logoutCookie?.includes("Max-Age=0"), "Logout must set Max-Age=0 to expire cookie")

  console.log("live integration tests: all assertions passed!")
}

runIntegrationTests().catch((err) => {
  console.error("live integration tests failed:", err)
  process.exit(1)
})
