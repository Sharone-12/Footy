import { Suspense, ViewTransition, type ReactNode } from "react"

/**
 * Suspense whose skeleton hands over to the real content instead of being
 * swapped for it: the placeholder drops away and the content rises in.
 *
 * `default="none"` on both sides keeps them still during every other
 * transition on the page; only this boundary resolving moves them. Browsers
 * without the View Transitions API just get the plain swap.
 */
export function Reveal({ fallback, children }: { fallback: ReactNode; children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <ViewTransition exit="slide-down" default="none">
          {fallback}
        </ViewTransition>
      }
    >
      <ViewTransition enter="slide-up" default="none">
        {children}
      </ViewTransition>
    </Suspense>
  )
}
