/**
 * Stream URL per fixture, keyed by `matches.event_id`.
 *
 * For officially embeddable streams — a club or UEFA YouTube live page, a
 * rights-holder's Twitch channel, a broadcaster that publishes an embed. See
 * `embedFor` in lib/stream-embed.ts for the hosts that can actually be
 * framed; everything else renders as a "Watch on …" link rather than an
 * embed, because those sites send X-Frame-Options and would show a blank box.
 *
 * A map rather than a database column on purpose: there are a handful of
 * these per season, and a column means a migration plus a loader change to
 * populate it. Move it to `matches.stream_url` if that stops being true.
 */
export const MATCH_STREAMS: Record<number, string> = {
  // Empty on purpose. A video id pinned here keeps playing whatever that id
  // points at later, so a stale entry silently serves an unrelated stream
  // rather than failing — 16421101 ended up on someone else's broadcast.
  // Only add an id you have just checked, and expect to re-check it.
}
