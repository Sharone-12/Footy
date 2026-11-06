import { streakLabel, type Form, type Outcome } from "@/lib/form"

/**
 * Last-five form: result pills, goals, and the current run.
 *
 * Presentational — the caller supplies the summary, so the same strip works
 * for any team without this file knowing how to query.
 */

export const OUTCOME_TONE: Record<Outcome, string> = {
  W: "var(--pitch)",
  D: "var(--muted-foreground)",
  L: "var(--destructive)",
}

export const OUTCOME_LABEL: Record<Outcome, string> = { W: "Won", D: "Drew", L: "Lost" }

export function FormStrip({ form }: { form: Form }) {
  if (form.results.length === 0) return null
  const streak = streakLabel(form)

  return (
    <div className="surface bg-card rounded-full pl-3 pr-4 py-1.5 flex items-center gap-3">
      <span className="stat-label text-[0.6rem] shrink-0">FORM</span>
      <span className="flex items-center gap-1" role="list" aria-label="Last five results">
        {form.results.map((r, i) => (
          <span
            key={i}
            role="listitem"
            aria-label={OUTCOME_LABEL[r]}
            title={OUTCOME_LABEL[r]}
            className="size-5 rounded-full grid place-items-center text-[0.6rem] font-bold text-white"
            style={{ background: OUTCOME_TONE[r] }}
          >
            {r}
          </span>
        ))}
      </span>
      {/* Spelled out: "17-9" sitting beside a row of result pills reads as a
          scoreline, when it is the aggregate across those five matches. */}
      <span
        className="stat-label text-[0.6rem] shrink-0 whitespace-nowrap"
        title={`Last ${form.results.length} matches: ${form.gf} scored, ${form.ga} conceded`}
      >
        {form.gf} scored · {form.ga} conceded
        {streak && <span className="hidden md:inline"> · {streak}</span>}
      </span>
    </div>
  )
}
