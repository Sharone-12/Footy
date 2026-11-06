import assert from "node:assert/strict"
import {
  fetchZLiveManifest,
  fetchFootballChannels,
  getGenericFootballChannels,
  _clearZLiveCache,
} from "./client"

async function runTests() {
  _clearZLiveCache()

  // 1. Manifest fetch
  const manifest = await fetchZLiveManifest()
  if (manifest) {
    assert.ok(manifest.channels.length > 0, "Manifest should have channels")
    assert.ok(manifest.baseUrl, "Manifest should have baseUrl")
  }

  // 2. Football channel filtering
  const footballChannels = await fetchFootballChannels()
  assert.ok(Array.isArray(footballChannels), "Should return an array")
  for (const ch of footballChannels) {
    const sport = (ch.sport || "").toLowerCase()
    assert.notEqual(sport, "kids", "Should not include kids sport")
    assert.notEqual(sport, "f1", "Should not include f1 sport")
    assert.ok(ch.id && ch.url, "Channel must have id and url")
  }

  // 3. Generic channels
  const generic = await getGenericFootballChannels()
  assert.ok(Array.isArray(generic), "Generic channels should return array")

  console.log("zlive client: all assertions passed")
}

runTests().catch((err) => {
  console.error("zlive client test failed:", err)
  process.exit(1)
})
