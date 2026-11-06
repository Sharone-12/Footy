import assert from "node:assert/strict"
import {
  validatePassword,
  createSessionToken,
  verifySessionToken,
  checkRateLimit,
  recordFailedAttempt,
  resetRateLimit,
  parseCookieHeader,
  LIVE_SESSION_COOKIE_NAME,
  MAX_FAILED_ATTEMPTS,
} from "./auth"

async function runTests() {
  console.log("Starting auth.test.ts...")

  // Test 1: Validate correct password (default "5589")
  const validResult = validatePassword("5589")
  assert.equal(validResult.valid, true, "Correct password should validate")

  // Test 2: Validate incorrect password
  const invalidResult = validatePassword("wrong_pass")
  assert.equal(invalidResult.valid, false, "Incorrect password should fail")
  assert.ok(invalidResult.error, "Should provide an error message")

  // Test 3: Validate empty or whitespace password
  const emptyResult = validatePassword("")
  assert.equal(emptyResult.valid, false, "Empty password should fail")
  const spaceResult = validatePassword("   ")
  assert.equal(spaceResult.valid, false, "Whitespace-only password should fail")
  const nullResult = validatePassword(null)
  assert.equal(nullResult.valid, false, "Null password should fail")

  // Test 4: Token generation and verification
  const token = createSessionToken()
  assert.ok(token.includes("."), "Token should contain expiry and signature")
  assert.equal(verifySessionToken(token), true, "Fresh token should verify")

  // Test 5: Tampered token rejection
  const tamperedToken = token.slice(0, -4) + "abcd"
  assert.equal(verifySessionToken(tamperedToken), false, "Tampered token signature must fail")

  const malformedToken = "invalid-token"
  assert.equal(verifySessionToken(malformedToken), false, "Malformed token must fail")

  // Test 6: Expired token rejection
  const expiredToken = createSessionToken(-10) // expired 10 seconds ago
  assert.equal(verifySessionToken(expiredToken), false, "Expired token must fail verification")

  // Test 7: Rate limiting
  const testIp = "192.168.1.100"
  resetRateLimit(testIp)

  // Initially allowed
  let rl = checkRateLimit(testIp)
  assert.equal(rl.allowed, true)
  assert.equal(rl.remainingAttempts, MAX_FAILED_ATTEMPTS)

  // Fail 4 times -> still allowed
  for (let i = 1; i <= 4; i++) {
    const res = recordFailedAttempt(testIp)
    assert.equal(res.locked, false, `Attempt ${i} should not lock`)
  }

  rl = checkRateLimit(testIp)
  assert.equal(rl.allowed, true)
  assert.equal(rl.remainingAttempts, 1)

  // 5th failure -> locked
  const lockRes = recordFailedAttempt(testIp)
  assert.equal(lockRes.locked, true, "5th failed attempt must trigger lockout")
  assert.ok(lockRes.retryAfterSeconds > 0)

  rl = checkRateLimit(testIp)
  assert.equal(rl.allowed, false, "Locked IP must be rejected")
  assert.ok(rl.retryAfterSeconds > 0)

  // Reset rate limit on login
  resetRateLimit(testIp)
  rl = checkRateLimit(testIp)
  assert.equal(rl.allowed, true)
  assert.equal(rl.remainingAttempts, MAX_FAILED_ATTEMPTS)

  // Test 8: Cookie header parsing
  const cookieHeader = `theme=dark; ${LIVE_SESSION_COOKIE_NAME}=${token}; other=value`
  const parsed = parseCookieHeader(cookieHeader, LIVE_SESSION_COOKIE_NAME)
  assert.equal(parsed, token)
  assert.equal(verifySessionToken(parsed), true)

  const missingCookie = parseCookieHeader(cookieHeader, "nonexistent")
  assert.equal(missingCookie, null)

  console.log("auth.test.ts: all assertions passed!")
}

runTests().catch((err) => {
  console.error("auth.test.ts failed:", err)
  process.exit(1)
})

