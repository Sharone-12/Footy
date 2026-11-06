import assert from "node:assert/strict"
import {
  fetchDamiTvStreams,
  fetchDamiTvStreamById,
  checkDamiTvHealth,
  _clearDamiTvCache,
} from "./client"

async function runTests() {
  _clearDamiTvCache()

  // 1. Health check test
  const health = await checkDamiTvHealth()
  assert.ok(typeof health.ok === "boolean", "Health should return an ok boolean")

  // 2. Fetch streams test (graceful fallback)
  const streams = await fetchDamiTvStreams()
  assert.ok(Array.isArray(streams), "Should return an array")

  // 3. Single stream lookup test
  const single = await fetchDamiTvStreamById("test-nonexistent-id")
  assert.equal(single, null, "Non-existent id should return null")

  console.log("damitv client: all assertions passed")
}

runTests().catch((err) => {
  console.error("damitv client test failed:", err)
  process.exit(1)
})
