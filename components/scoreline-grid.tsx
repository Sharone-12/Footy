import {
  foldScorelines,
  topScoreline,
  likeliestScorelines,
  type Band,
} from "@/lib/scorelines"
import { ScorelineSurface } from "@/components/scoreline-surface"

/**
 * The joint distribution over exact scorelines, as a table.
 *
 * The three percentages above this on the page are sums of this grid, and the
 * sum is the part that throws information away: 41% home is one number whether
 * it is a near-certain 1–0 or a smear across six scorelines, and a reader who
 * only ever sees the 41% cannot tell those apart. So the cells are tinted by
 * the outcome they belong to — the home band below the diagonal, the draws on
 * it, the away band above — which makes the heatmap legible as the same three
 * quantities, and makes how tightly the probability clusters visible at a
 * glance rather than something to be worked out.
 *
 * A real `<table>` with real header cells, because every cell is a scoreline
 * and a screen reader should be able to say which one.
 */

/** Matches `OUTCOME_COLORS` on the prediction page, so the bands agree. */
const BAND_COLOR: Record<Band, string> = {
  home: "oklch(0.80 0.19 150)",
  draw: "oklch(0.70 0.045 252)",
  away: "oklch(0.72 0.14 40)",
  mixed: "var(--muted-foreground)",
}

/**
 * Tint strength for a cell, relative to the most likely one.
 *
 * Square-rooted so the long flat tail is still visibly warmer than an empty
 * cell — on a linear ramp everything outside the few likely scorelines reads
 * as the same nothing. Topping out at 0.38 is a contrast floor, not taste: the
 * band colours sit near 0.8 lightness, and a stronger tint over the near-black
 * card lands close enough to the text colour to fail on the small figures.
 */
function tint(p: number, max: number): number {
  if (p <= 0 || max <= 0) return 0
  return Math.sqrt(p / max) * 0.38
}

const pct = (p: number) => `${(p * 100).toFixed(1)}%`

export function ScorelineGrid({
  grid,
  home,
  away,
}: {
  /** `grid[h][a]`, normalised — straight from `scoreGrid`. */
  grid: number[][]
  home: string
  away: string
}) {
  const { cells, labels, bandOf } = foldScorelines(grid)
  const top = topScoreline(grid)
  const alternatives = likeliestScorelines(grid, 4).slice(1)
  const max = Math.max(...cells.flat())
  const last = cells.length - 1
  // Which cell to ring. The likeliest scoreline is read off the unfolded grid,
  // so on a freakish expected-goals pair it can be a score above the cap —
  // and then there is no cell with that index and the ring silently vanishes.
  // Fold the coordinates the same way the cells were folded.
  const topRow = Math.min(top.home, last)
  const topCol = Math.min(top.away, last)

  return (
    <section className="spark surface rounded-2xl bg-card p-5">
      <h2 className="stat-label text-sm mb-4" style={{ color: "var(--pitch)" }}>
        Scoreline
      </h2>

      {/* The likeliest result, then the ones close behind it. Three figures
          rather than one, because the gap between them is the story: a clear
          favourite scoreline and four near-ties are different predictions. */}
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3 mb-6">
        <div>
          <div
            className="stat-figure text-4xl sm:text-5xl"
            style={{ fontFamily: "var(--font-condensed)" }}
          >
            {top.home}
            <span className="text-muted-foreground mx-1.5">–</span>
            {top.away}
          </div>
          <div className="stat-label mt-1.5">{pct(top.prob)} likeliest</div>
        </div>

        <div className="flex gap-4">
          {alternatives.map((s) => (
            <div key={`${s.home}-${s.away}`}>
              <div
                className="stat-figure text-xl text-muted-foreground"
                style={{ fontFamily: "var(--font-condensed)" }}
              >
                {s.home}–{s.away}
              </div>
              <div className="stat-label mt-1 text-[0.6rem]">{pct(s.prob)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        {/* Which way round the grid runs, said with the team names rather than
            with the words "home" and "away" above a grid of numbers. */}
        <div
          className="stat-label self-stretch flex items-center justify-center text-[0.6rem] [writing-mode:vertical-rl] rotate-180 shrink-0"
          title={`${home} goals`}
        >
          <span className="truncate max-h-40">{home}</span>
        </div>

        <div className="min-w-0 flex-1">
          <div
            className="stat-label text-[0.6rem] mb-1.5 truncate"
            title={`${away} goals`}
          >
            {away}
          </div>

          <table className="w-full border-separate border-spacing-[2px] table-fixed">
            <caption className="sr-only">
              Chance of each exact scoreline. Rows are {home} goals, columns are{" "}
              {away} goals.
            </caption>
            <thead>
              <tr>
                <th className="w-6" />
                {labels.map((l) => (
                  <th
                    key={l}
                    scope="col"
                    className="stat-label text-[0.6rem] pb-1"
                  >
                    {l}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cells.map((row, h) => (
                <tr key={h}>
                  <th
                    scope="row"
                    className="stat-label text-[0.6rem] pr-1 text-right"
                  >
                    {labels[h]}
                  </th>
                  {row.map((p, a) => {
                    const band = bandOf(h, a)
                    const isTop = h === topRow && a === topCol
                    return (
                      <td
                        key={a}
                        className="stat-figure text-center text-[0.6rem] leading-none py-[0.45rem] rounded-[4px] tabular-nums"
                        style={{
                          background: `color-mix(in oklab, ${BAND_COLOR[band]} ${(
                            tint(p, max) * 100
                          ).toFixed(1)}%, transparent)`,
                          // The ring marks the likeliest cell without adding a
                          // fourth colour to a chart that already has three.
                          boxShadow: isTop
                            ? "inset 0 0 0 1.5px var(--foreground)"
                            : undefined,
                          fontWeight: isTop ? 700 : 500,
                        }}
                        title={`${home} ${labels[h]} – ${labels[a]} ${away}: ${pct(p)}`}
                      >
                        {/* Below a percent the figure is noise and crowds the
                            cells; the tint still carries it. */}
                        {p >= 0.01 ? (p * 100).toFixed(0) : ""}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-4">
        {(
          [
            ["home", `${home} win`],
            ["draw", "Draw"],
            ["away", `${away} win`],
          ] as const
        ).map(([band, label]) => (
          <span key={band} className="flex items-center gap-1.5 min-w-0">
            <span
              className="size-2.5 rounded-[3px] shrink-0"
              style={{
                background: `color-mix(in oklab, ${BAND_COLOR[band]} 38%, transparent)`,
              }}
            />
            <span className="stat-label text-[0.6rem] truncate">{label}</span>
          </span>
        ))}
        <span className="stat-label text-[0.6rem] text-muted-foreground">
          Cells show whole percent
        </span>
      </div>

      <ScorelineSurface
        cells={cells}
        labels={labels}
        last={last}
        home={home}
        away={away}
      />
    </section>
  )
}
