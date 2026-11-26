import { ViewTransition, type ReactNode } from "react"

/**
 * A player's name, paired with the same name on the player page so that
 * clicking a row sends the text itself to the top of the next page instead of
 * the page cutting and redrawing.
 *
 * The portrait pairing already does this from the squad grid. The boards on
 * the home page have no portrait to send — a row is a rank, a name, a crest
 * and a number — so the name is the shared element, and it grows from list
 * text into the title. That the type changes size and weight across the
 * boundary is the point: morph interpolates between the two boxes, so the
 * reader's eye stays on the word it clicked while everything else fades.
 *
 * `name` undefined means some earlier element on the page already claimed
 * this player (see `lib/view-transition.ts`), so this one renders plain.
 * `default="none"` keeps it still during every unrelated transition.
 */
export function PlayerTitle({
  name,
  children,
}: {
  name: string | undefined
  children: ReactNode
}) {
  if (!name) return <>{children}</>
  return (
    <ViewTransition name={name} share="morph" default="none">
      {children}
    </ViewTransition>
  )
}
