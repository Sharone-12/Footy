/** Self-check for the embed URL parser: `node lib/stream-embed.test.ts` */
import assert from "node:assert/strict"
import { embedFor } from "./stream-embed.ts"

const ID = "AbCdEf12345"
const YT = `https://www.youtube-nocookie.com/embed/${ID}`

// Every shape YouTube hands out as a share link lands on the same embed.
for (const url of [
  `https://www.youtube.com/watch?v=${ID}`,
  `https://youtube.com/watch?v=${ID}&t=90s`,
  `https://youtu.be/${ID}`,
  `https://www.youtube.com/live/${ID}`,
  `https://m.youtube.com/embed/${ID}`,
  `  https://www.youtube.com/watch?v=${ID}  `,
]) {
  assert.deepEqual(embedFor(url), { kind: "youtube", src: YT, id: ID }, url)
}

// Twitch cannot play without the embedding page's hostname.
assert.deepEqual(embedFor("https://twitch.tv/somechannel"), {
  kind: "link",
  src: "https://twitch.tv/somechannel",
  host: "twitch.tv",
})
assert.deepEqual(embedFor("https://www.twitch.tv/somechannel", "footyy.app"), {
  kind: "twitch",
  src: "https://player.twitch.tv/?channel=somechannel&parent=footyy.app",
})
assert.deepEqual(embedFor("https://twitch.tv/videos/123456789", "localhost"), {
  kind: "twitch",
  src: "https://player.twitch.tv/?video=123456789&parent=localhost",
})

assert.deepEqual(embedFor("https://www.dailymotion.com/video/x8abcde"), {
  kind: "dailymotion",
  src: "https://www.dailymotion.com/embed/video/x8abcde",
})
assert.deepEqual(embedFor("https://vimeo.com/123456789"), {
  kind: "vimeo",
  src: "https://player.vimeo.com/video/123456789",
})

// Anything else is a link, not a frame: it would render blank.
assert.equal(embedFor("https://example.com/match/live")?.kind, "link")
assert.equal(embedFor("https://www.youtube.com/results?q=barca")?.kind, "link")

// Junk never reaches an href.
assert.equal(embedFor("not a url"), null)
assert.equal(embedFor("javascript:alert(1)"), null)
assert.equal(embedFor("https://youtu.be/../../etc")?.kind, "link")
assert.equal(embedFor("https://twitch.tv/a/b/c", "footyy.app")?.kind, "link")

console.log("stream-embed: all assertions passed")
