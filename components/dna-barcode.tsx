import { DNA_KEYS } from "@/lib/dna"

/**
 * A style fingerprint drawn as a barcode: one column per stat, up for more
 * than the average outfielder and down for less. Two players who play alike
 * have barcodes that look alike, which is the point of drawing it.
 *
 * Each column holds an up bar and a down bar and only their heights change,
 * so swapping in another player's values morphs the shape, through zero when
 * a stat flips sign, instead of redrawing it. `ticks` leaves thin markers at
 * a second player's values to measure the difference against.
 */
export function Barcode({
  z,
  ticks,
  height = 56,
  animate = false,
  flip = false,
}: {
  z: number[]
  ticks?: number[]
  height?: number
  animate?: boolean
  /** Mirror vertically, to set one player under another. */
  flip?: boolean
}) {
  const half = height / 2
  const len = (v: number) => (Math.abs(v) / 3) * half
  return (
    <div
      className="flex items-center gap-[2px]"
      style={{ height, transform: flip ? "scaleY(-1)" : undefined }}
      role="img"
      aria-label="Style fingerprint"
    >
      {z.map((v, i) => (
        <span
          key={DNA_KEYS[i].key}
          title={`${DNA_KEYS[i].label}: ${v > 0 ? "+" : ""}${v.toFixed(1)}σ`}
          className="relative flex-1 min-w-[2px]"
          style={{ height }}
        >
          <span
            className={`dna-col absolute inset-x-0 rounded-[1px] ${animate ? "dna-bar" : ""}`}
            style={{
              bottom: half,
              height: Math.max(v > 0 ? 2 : 0, v > 0 ? len(v) : 0),
              transformOrigin: "bottom",
              background: "var(--pitch)",
              opacity: 0.35 + Math.min(1, Math.max(0, v) / 2) * 0.65,
              animationDelay: animate ? `${i * 28}ms` : undefined,
            }}
          />
          <span
            className={`dna-col absolute inset-x-0 rounded-[1px] ${animate ? "dna-bar" : ""}`}
            style={{
              top: half,
              height: Math.max(v <= 0 ? 2 : 0, v <= 0 ? len(v) : 0),
              transformOrigin: "top",
              background: "var(--muted-foreground)",
              opacity: 0.45,
              animationDelay: animate ? `${i * 28}ms` : undefined,
            }}
          />
          {ticks && (
            <span
              className="dna-col absolute inset-x-[-1px] h-[2px] rounded-full bg-foreground"
              style={{ top: half - (ticks[i] / 3) * half - 1 }}
            />
          )}
        </span>
      ))}
    </div>
  )
}
