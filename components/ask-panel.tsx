"use client"

import { useState, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { resolveSeason } from "@/lib/seasons"
import { resolveCompetition } from "@/lib/competition"

export type Cited = {
  player: string
  slug: string
  team: string
  score: number
  minutes: number
}

export type AskState = {
  loading: boolean
  answer: string | null
  cited: Cited[]
  error: string | null
}

const EMPTY: AskState = { loading: false, answer: null, cited: [], error: null }

/** Shared by the floating panel and the compare page's "Who's better?" button. */
export function useAsk() {
  const [state, setState] = useState<AskState>(EMPTY)
  const router = useRouter()
  const params = useSearchParams()
  const season = resolveSeason(params.get("season"))
  const comp = resolveCompetition(params.get("comp"))

  const ask = useCallback(async (question: string, slugs: string[] = []) => {
    setState({ ...EMPTY, loading: true })
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, slugs, season, comp }),
      })
      const json = await res.json()
      if (!res.ok) {
        setState({
          ...EMPTY,
          error: json.error ?? `Request failed (${res.status})`,
        })
        return
      }
      // Server short-circuited to a compare redirect — navigate instead of
      // displaying an answer in the panel. The compare page's auto-ask fires
      // the "who's better" verdict once it mounts.
      if (typeof json.redirect === "string" && json.redirect) {
        setState(EMPTY)
        router.push(json.redirect)
        return
      }
      setState({
        loading: false,
        answer: json.answer ?? null,
        cited: json.cited ?? [],
        error: null,
      })
    } catch (e) {
      setState({
        ...EMPTY,
        error: e instanceof Error ? e.message : "Network error",
      })
    }
  }, [season, comp, router])

  return { ...state, ask }
}

export function AskAnswer({ loading, answer, cited, error }: AskState) {
  if (loading) {
    return (
      <p className="text-muted-foreground text-sm animate-pulse">Thinking…</p>
    )
  }
  if (error) {
    return (
      <p className="text-sm" style={{ color: "oklch(0.70 0.17 25)" }}>
        {error}
      </p>
    )
  }
  if (!answer) return null

  return (
    <div className="space-y-3">
      {answer.split(/\n{2,}/).map((para, i) => (
        <p key={i} className="text-sm leading-relaxed whitespace-pre-wrap">
          {para}
        </p>
      ))}
      {cited.length > 0 && (
        <div className="pt-2 border-t border-white/5">
          <div className="stat-label mb-1.5">Players used</div>
          <div className="flex flex-wrap gap-1.5">
            {cited.slice(0, 12).map((c) => (
              <Link
                key={c.slug + c.player}
                href={`/player/${c.slug}`}
                className="text-xs px-2 py-0.5 rounded bg-secondary/50 hover:bg-secondary transition-colors"
                title={`${c.team} · score ${c.score} · ${c.minutes} min`}
              >
                {c.player}
                <span className="ml-1.5 tabular-nums text-muted-foreground">
                  {c.score}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
