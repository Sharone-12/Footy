import { TargetIcon, LayersIcon } from "lucide-react"

/**
 * The model's view of a fixture's markets.
 *
 * Computed on the server (see /predictions) and handed over whole, so the
 * browser ships none of the maths. Shown only for fixtures that have not
 * kicked off; afterwards the card has a result and these stop being a
 * forecast.
 */
export type BestBet = {
  /** The safest single selection worth showing, capped below the trivial ones. */
  top: { label: string; prob: number } | null
  /** Two selections from different markets, with their exact joint chance. */
  double: { labels: [string, string]; prob: number } | null
  /** A handful of standard markets, for context around the pick. */
  markets: { label: string; prob: number }[]
  /** Likeliest scorer and the chance they get one. */
  scorer: { player: string; slug: string; team: string; prob: number } | null
  /** Likeliest exact scoreline. */
  score: { home: number; away: number; prob: number } | null
}

const pct = (p: number) => `${Math.round(p * 100)}%`

/** Green for a strong call, amber in the middle, grey when it is a coin toss. */
function tone(p: number): string {
  if (p >= 0.65) return "var(--pitch)"
  if (p >= 0.5) return "var(--tone-amber)"
  return "var(--muted-foreground)"
}

function Bar({ prob }: { prob: number }) {
  return (
    <span className="block h-1 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden mt-1">
      <span
        className="block h-full rounded-full"
        style={{ width: `${Math.max(2, prob * 100)}%`, background: tone(prob) }}
      />
    </span>
  )
}

export function BestBetPanel({ bet, dark }: { bet: BestBet; dark?: boolean }) {
  if (!bet.top && !bet.double) return null
  const label = dark ? "!text-white/75" : ""
  const muted = dark ? "text-white/70" : "text-muted-foreground"

  return (
    <div className={`pt-2.5 border-t ${dark ? "border-white/15" : "border-border/60"} space-y-2.5`}>
      {bet.top && (
        <div>
          <div className="flex items-baseline justify-between gap-2">
            <span className={`stat-label text-[0.65rem] inline-flex items-center gap-1 ${label}`}>
              <TargetIcon className="size-3" aria-hidden />
              Safest call
            </span>
            <span className="stat-figure text-sm tabular-nums" style={{ color: tone(bet.top.prob) }}>
              {pct(bet.top.prob)}
            </span>
          </div>
          <div className={`text-[0.82rem] font-semibold truncate ${dark ? "text-white" : ""}`}>
            {bet.top.label}
          </div>
          <Bar prob={bet.top.prob} />
        </div>
      )}

      {bet.double && (
        <div>
          <div className="flex items-baseline justify-between gap-2">
            <span className={`stat-label text-[0.65rem] inline-flex items-center gap-1 ${label}`}>
              <LayersIcon className="size-3" aria-hidden />
              Safest double
            </span>
            <span
              className="stat-figure text-sm tabular-nums"
              style={{ color: tone(bet.double.prob) }}
            >
              {pct(bet.double.prob)}
            </span>
          </div>
          <div className={`text-[0.78rem] leading-snug ${muted}`}>
            <span className={dark ? "text-white" : "text-foreground"}>{bet.double.labels[0]}</span>
            <span className="opacity-60"> + </span>
            <span className={dark ? "text-white" : "text-foreground"}>{bet.double.labels[1]}</span>
          </div>
          <Bar prob={bet.double.prob} />
        </div>
      )}

      {bet.scorer && (
        <div className="flex items-baseline justify-between gap-2">
          <span className={`stat-label text-[0.65rem] ${label}`}>To score</span>
          <span className="flex items-baseline gap-1.5 min-w-0">
            <span className={`text-[0.78rem] font-medium truncate ${dark ? "text-white" : ""}`}>
              {bet.scorer.player}
            </span>
            <span
              className="stat-figure text-xs tabular-nums shrink-0"
              style={{ color: tone(bet.scorer.prob) }}
            >
              {pct(bet.scorer.prob)}
            </span>
          </span>
        </div>
      )}

      {bet.markets.length > 0 && (
        <div className="grid grid-cols-3 gap-x-2 gap-y-1">
          {bet.markets.map((m) => (
            <span key={m.label} className="min-w-0">
              <span className={`stat-label text-[0.58rem] block truncate ${label}`}>{m.label}</span>
              <span className={`stat-figure text-xs tabular-nums ${dark ? "text-white" : ""}`}>
                {pct(m.prob)}
              </span>
            </span>
          ))}
        </div>
      )}

      {bet.score && (
        <p className={`text-[0.65rem] ${muted}`}>
          Likeliest score {bet.score.home}&ndash;{bet.score.away} at {pct(bet.score.prob)}. Model
          probabilities, not advice.
        </p>
      )}
    </div>
  )
}
