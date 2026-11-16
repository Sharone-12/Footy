/**
 * The Barça loading state: a rondo. Six players on the circle keep the ball
 * moving in triangles while one in the middle chases it and never gets there.
 *
 * SVG animateMotion rather than CSS, so the ball and the chaser follow real
 * paths with no script. The chaser runs the same shape, smaller and a beat
 * behind.
 */
const PLAYERS: [number, number][] = [
  [60, 16], [98.1, 38], [98.1, 82], [60, 104], [21.9, 82], [21.9, 38],
]
/** Two triangles, joined: 0-2-4, across to 1, then 1-3-5 and home. */
const PASSES = "M60 16 L98.1 82 L21.9 82 L98.1 38 L60 104 L21.9 38 Z"
const CHASE = "M60 42.4 L75.2 68.8 L44.8 68.8 L75.2 51.2 L60 77.6 L44.8 51.2 Z"

export function Rondo({ label = "Loading", className = "" }: { label?: string; className?: string }) {
  return (
    <div
      role="status"
      aria-label={label}
      className={`surface rounded-2xl bg-card flex flex-col items-center justify-center gap-3 ${className}`}
    >
      <svg viewBox="0 0 120 120" className="size-28" aria-hidden>
        <circle cx="60" cy="60" r="44" fill="none" stroke="var(--border)" strokeDasharray="2 5" />
        {PLAYERS.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="6.5" fill={i % 2 === 0 ? "#1B3F8F" : "#A50044"} stroke="#EDBB00" strokeWidth="1.2" />
        ))}
        {/* The one in the middle. */}
        <circle r="5" fill="var(--muted-foreground)" opacity="0.7" cx="60" cy="60" className="rondo-still" />
        <circle r="5" fill="var(--muted-foreground)" opacity="0.7" className="rondo-move">
          <animateMotion path={CHASE} dur="3s" begin="-2.6s" repeatCount="indefinite" />
        </circle>
        {/* The ball. */}
        <circle r="3.4" fill="#fff" cx="60" cy="16" className="rondo-still" />
        <circle r="3.4" fill="#fff" className="rondo-move">
          <animateMotion path={PASSES} dur="3s" repeatCount="indefinite" />
        </circle>
      </svg>
      <span className="stat-label">{label}</span>
    </div>
  )
}
