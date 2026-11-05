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
  // Barça at Atlético Madrid, 8 Nov — the next fixture, which is the one
  // /squad/stream reads.
  16421101: "https://www.youtube.com/live/BHtpYK0tV6U?si=d_g0CZiPMPx58GBL",
}
