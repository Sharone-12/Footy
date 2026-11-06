import assert from "node:assert/strict"
import {
  fetchSoccerStreams,
  fetchSingleStream,
  fetchStreamSources,
  clearStreamFreeCache,
} from "./client.ts"

async function runTests() {
  clearStreamFreeCache()
  const originalFetch = globalThis.fetch

  try {
    let callCount = 0
    const mockStreams = [
      {
        id: "test-match",
        name: "Team A vs Team B",
        category: "soccer",
        league: "Premier League",
        stream_key: "test-match",
        match_timestamp: 1793995200,
        sources: [{ quality: "HD", url: "https://strmfree.st/embed/soccer/test", live: true }],
      },
    ]

    globalThis.fetch = (async (url: string | URL | Request) => {
      callCount++
      const urlStr = url.toString()
      if (urlStr.includes("streams?category=soccer")) {
        return new Response(JSON.stringify({ count: 1, streams: mockStreams }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      }
      if (urlStr.includes("/api/v1/streams/test-match")) {
        return new Response(JSON.stringify(mockStreams[0]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      }
      return new Response(JSON.stringify({ error: "not found" }), { status: 404 })
    }) as unknown as typeof fetch

    // 1. First call fetches from API
    const res1 = await fetchSoccerStreams()
    assert.equal(res1.length, 1)
    assert.equal(callCount, 1)

    // 2. Second call within TTL returns cached result without extra fetch
    const res2 = await fetchSoccerStreams()
    assert.equal(res2.length, 1)
    assert.equal(callCount, 1, "Cached call should not invoke fetch again")

    // 3. Concurrent calls are deduplicated into one in-flight request
    clearStreamFreeCache()
    callCount = 0
    const [c1, c2, c3] = await Promise.all([
      fetchSoccerStreams(),
      fetchSoccerStreams(),
      fetchSoccerStreams(),
    ])
    assert.equal(c1.length, 1)
    assert.equal(c2.length, 1)
    assert.equal(c3.length, 1)
    assert.equal(callCount, 1, "Concurrent in-flight calls must be deduplicated into 1 request")

    // 4. Single stream endpoint
    const single = await fetchSingleStream("test-match")
    assert.ok(single)
    assert.equal(single?.stream_key, "test-match")

    // 5. Sources endpoint
    const sources = await fetchStreamSources("test-match")
    assert.equal(sources.length, 1)
    assert.equal(sources[0].quality, "HD")
    assert.equal(sources[0].live, true)

    // 6. Graceful failure handling
    globalThis.fetch = (async () => {
      throw new Error("Network offline")
    }) as unknown as typeof fetch

    clearStreamFreeCache()
    const errorFallback = await fetchSoccerStreams()
    assert.deepEqual(errorFallback, [], "Network error must safely return empty array or stale cache")

    console.log("streamfree client: all assertions passed")
  } finally {
    globalThis.fetch = originalFetch
  }
}

runTests().catch((err) => {
  console.error("Test failed:", err)
  process.exit(1)
})
