/**
 * The two state marks a fixture row can show: on-air, and counting down.
 *
 * Both were a coloured dot with `animate-ping` / `animate-pulse` on it — the
 * stock Tailwind indicator, which reads as a generic notification blip rather
 * than anything to do with a match. These draw real SVG instead, so the live
 * mark looks like a broadcast and the countdown shows the hour draining away
 * rather than just blinking.
 *
 * Keyframes live in globals.css with the rest, and the reduced-motion block
 * there stops both animations; the countdown ring still reads correctly when
 * static, because the arc itself carries the value.
 */

/** The window the countdown ring represents — the final hour before kickoff. */
const RING_WINDOW_MS = 3600_000
const R = 9
const CIRCUMFERENCE = 2 * Math.PI * R

const pad = (n: number) => String(n).padStart(2, "0")

/**
 * On-air mark: a solid core with arcs radiating from it, like a signal
 * leaving a transmitter. The two pairs are staggered so the eye reads one
 * wave travelling outward rather than two rings blinking in unison.
 */
export function LiveSignal({ size = 13 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className="shrink-0 overflow-visible"
    >
      <circle cx="8" cy="8" r="2.5" fill="var(--pitch)" />
      <path
        className="live-wave"
        d="M11.2 4.8a4.5 4.5 0 0 1 0 6.4M4.8 11.2a4.5 4.5 0 0 1 0-6.4"
        stroke="var(--pitch)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        className="live-wave live-wave-2"
        d="M13.4 2.6a7.6 7.6 0 0 1 0 10.8M2.6 13.4a7.6 7.6 0 0 1 0-10.8"
        stroke="var(--pitch)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** The full live badge: mark plus label, as the fixture rows use it. */
export function LiveBadge() {
  return (
    <span className="inline-flex items-center gap-1.5">
      <LiveSignal />
      <span
        className="stat-label text-[0.65rem] font-bold"
        style={{ color: "var(--pitch)" }}
      >
        LIVE
      </span>
    </span>
  )
}

/**
 * Countdown to kickoff: a draining ring plus MM:SS.
 *
 * The arc is the remaining share of the final hour, so a glance answers "how
 * close is this" without reading the digits. Inside the last five minutes
 * both ring and figures turn red and the core starts pulsing — the only
 * colour change, because the shape is doing the work.
 *
 * The caller only renders this when kickoff is under an hour away.
 */
export function KickoffCountdown({ msLeft }: { msLeft: number }) {
  const clamped = Math.max(0, Math.min(RING_WINDOW_MS, msLeft))
  const remaining = clamped / RING_WINDOW_MS
  const imminent = clamped <= 5 * 60_000
  const tone = imminent ? "oklch(0.70 0.20 25)" : "oklch(0.83 0.16 85)"

  const totalSeconds = Math.floor(clamped / 1000)
  const label = `${pad(Math.floor(totalSeconds / 60))}:${pad(totalSeconds % 60)}`

  return (
    <span className="inline-flex items-center gap-1.5" title={`Kicks off in ${label}`}>
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        className="shrink-0 -rotate-90"
      >
        <circle
          cx="12"
          cy="12"
          r={R}
          stroke="currentColor"
          strokeWidth="2.5"
          className="text-white/10"
        />
        <circle
          cx="12"
          cy="12"
          r={R}
          stroke={tone}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - remaining)}
          // Only the sweep is eased: at one tick per second the un-eased jump
          // is visible on a ring this small.
          style={{ transition: "stroke-dashoffset 1s linear, stroke 300ms ease" }}
        />
        {imminent && <circle cx="12" cy="12" r="2.5" fill={tone} className="countdown-core" />}
      </svg>
      <span
        className="font-mono font-bold text-xs sm:text-sm tabular-nums"
        style={{ color: tone }}
      >
        {label}
      </span>
    </span>
  )
}

/* ── Network health marks ─────────────────────────────────────────────────
 *
 * The health card showed seven identical flat green dots in a row, which
 * carried one bit each (green or not) and read as decoration. Bars carry
 * the same state plus a sense of strength, and the gentle stagger says
 * "data arriving" without the strobe of a ping dot — seven of those side by
 * side was the thing that looked like slop.
 */

export type HealthState = "healthy" | "degraded" | "offline"

const BAR_TONE: Record<HealthState, string> = {
  healthy: "var(--pitch)",
  degraded: "oklch(0.83 0.16 85)",
  offline: "oklch(0.55 0.01 260)",
}

/** How many of the three bars are lit for each state. */
const BAR_LIT: Record<HealthState, number> = { healthy: 3, degraded: 2, offline: 1 }

/**
 * Three ascending bars as a feed-strength readout. Only the healthy state
 * animates, and only by a quarter of its height, so a row of seven reads as
 * alive rather than flashing.
 */
export function SignalBars({ state }: { state: HealthState }) {
  const tone = BAR_TONE[state]
  const lit = BAR_LIT[state]
  return (
    <svg
      width="13"
      height="12"
      viewBox="0 0 13 12"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      {[0, 1, 2].map((i) => {
        const h = 4 + i * 3
        return (
          <rect
            key={i}
            x={i * 4.5}
            y={12 - h}
            width="2.5"
            height={h}
            rx="1.25"
            fill={tone}
            opacity={i < lit ? 1 : 0.22}
            className={state === "healthy" ? `feed-bar feed-bar-${i}` : undefined}
          />
        )
      })}
    </svg>
  )
}

/**
 * Round-trip time as a three-segment meter plus the figure.
 *
 * The number alone gave no sense of whether 1892ms is fine or bad; the
 * segments answer that at a glance, and the colour only changes at the two
 * thresholds rather than on every value.
 */
export function LatencyMeter({ ms }: { ms: number }) {
  const band = ms < 400 ? 3 : ms < 1200 ? 2 : 1
  const tone =
    band === 3 ? "var(--pitch)" : band === 2 ? "oklch(0.83 0.16 85)" : "oklch(0.70 0.20 25)"
  return (
    <span
      className="inline-flex items-center gap-1 shrink-0"
      title={`${ms}ms round trip`}
    >
      <svg width="12" height="8" viewBox="0 0 12 8" fill="none" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <rect
            key={i}
            x={i * 4.3}
            y="2"
            width="3.4"
            height="4"
            rx="1"
            fill={tone}
            opacity={i < band ? 1 : 0.2}
          />
        ))}
      </svg>
      <span className="text-[9px] font-mono tabular-nums" style={{ color: tone }}>
        {ms}ms
      </span>
    </span>
  )
}
