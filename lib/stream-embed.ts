/**
 * Turn a stream page URL into something an <iframe> will actually load.
 *
 * Almost every site refuses to be framed — `X-Frame-Options: DENY` or a CSP
 * `frame-ancestors` rule, and the browser renders a blank box — so only the
 * platforms that publish an embed endpoint can be embedded at all. Everything
 * else resolves to `link`, which the UI shows as a "Watch on …" button
 * instead of a dead frame.
 */

export type StreamEmbed =
  /** `id` so the custom player can drive this through the YouTube JS API. */
  | { kind: "youtube"; src: string; id: string }
  | { kind: "twitch" | "dailymotion" | "vimeo" | "iframe"; src: string }
  | { kind: "link"; src: string; host: string }

const YOUTUBE_HOSTS = ["youtube.com", "youtu.be", "youtube-nocookie.com"]

/** Ids go straight into a URL, so only ever pass through known-safe shapes. */
const ID = /^[\w-]{6,24}$/
const CHANNEL = /^\w{3,25}$/
const DIGITS = /^\d{6,12}$/

const bare = (host: string) => host.replace(/^(www|m|player)\./, "")

function youtubeId(u: URL, path: string[]): string | null {
  if (bare(u.hostname) === "youtu.be") return path[0] ?? null
  if (path[0] === "watch") return u.searchParams.get("v")
  // /live/<id> is what a scheduled stream's share link looks like.
  if (["embed", "live", "shorts", "v"].includes(path[0])) return path[1] ?? null
  return null
}

/**
 * `parentHost` is the hostname the page is served from — Twitch refuses to
 * play without it, so pass window.location.hostname. Omit it and a Twitch URL
 * degrades to a link rather than to an embed that silently shows an error.
 */
export function embedFor(url: string, parentHost?: string | null): StreamEmbed | null {
  let u: URL
  try {
    u = new URL(url.trim())
  } catch {
    return null
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null

  const host = bare(u.hostname)
  const path = u.pathname.split("/").filter(Boolean)
  const link: StreamEmbed = { kind: "link", src: u.toString(), host }

  if (YOUTUBE_HOSTS.includes(host)) {
    const id = youtubeId(u, path)
    if (!id || !ID.test(id)) return link
    // -nocookie is the same player, without the tracking cookie on first load.
    return { kind: "youtube", src: `https://www.youtube-nocookie.com/embed/${id}`, id }
  }

  if (host === "twitch.tv") {
    if (!parentHost) return link
    const parent = `parent=${encodeURIComponent(parentHost)}`
    if (path[0] === "videos" && DIGITS.test(path[1] ?? "")) {
      return { kind: "twitch", src: `https://player.twitch.tv/?video=${path[1]}&${parent}` }
    }
    if (path.length === 1 && CHANNEL.test(path[0])) {
      return { kind: "twitch", src: `https://player.twitch.tv/?channel=${path[0]}&${parent}` }
    }
    return link
  }

  if (host === "dailymotion.com" || host === "dai.ly") {
    const id = host === "dai.ly" ? path[0] : path[0] === "video" ? path[1] : null
    if (!id || !ID.test(id)) return link
    return { kind: "dailymotion", src: `https://www.dailymotion.com/embed/video/${id}` }
  }

  if (host === "vimeo.com") {
    const id = path[0]
    if (!id || !DIGITS.test(id)) return link
    return { kind: "vimeo", src: `https://player.vimeo.com/video/${id}` }
  }

  // Embeddable football streaming providers
  if (host === "cinevid.st" && path[0] === "embed") {
    return { kind: "iframe", src: u.toString() }
  }

  if (host === "damitv.st" && (path[0] === "embed" || path[0] === "player")) {
    return { kind: "iframe", src: u.toString() }
  }

  if (host === "zlive.st" && path[0] === "embed") {
    return { kind: "iframe", src: u.toString() }
  }

  return link
}
