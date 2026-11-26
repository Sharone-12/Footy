/**
 * Handing out `view-transition-name`s when the same player is on screen twice.
 *
 * A name has to be unique in the document. Two elements carrying one name is
 * not a near miss that degrades — the browser abandons the whole transition,
 * so one duplicate anywhere on the page silently costs every other pairing on
 * it too. The home page hits this on every load: the leading scorer is both
 * the headline card and row one of TOP SCORERS, and anyone with goals and
 * assists is in both boards.
 *
 * So the name is a claim. The first element to ask for a player gets it and
 * animates; later ones get `undefined` and stay still. Claim in the order the
 * eye would pick an element to follow — headline cards before list rows — and
 * the one that travels is the one worth watching.
 *
 * A factory rather than a module-level set: on the server one shared set would
 * be read by every concurrent request, and a slug claimed for one visitor
 * would go missing for the next.
 *
 * Where this deliberately stops: the overlays. The command palette, the player
 * search, the ask panel, the signal expander and the DNA table all list player
 * names over a page that has already handed out its own claims, and a claimer
 * cannot see across those trees — so pairing a palette row would put a second
 * `pname-<slug>` in the document whenever the player behind it is also on
 * screen, which does not degrade to "no animation for the palette" but kills
 * every transition on the page. An overlay also closes as the navigation
 * starts, so there is nothing stable to morph from. They stay unpaired on
 * purpose; pair one only alongside a document-wide claimer.
 */
export function playerNames() {
  const seen = new Set<string>()
  return (slug: string | null | undefined): string | undefined => {
    if (!slug || seen.has(slug)) return undefined
    seen.add(slug)
    return playerTitleName(slug)
  }
}

/** The name the player page puts on its `<h1>`. Paired with a claim above. */
export function playerTitleName(slug: string): string {
  return `pname-${slug}`
}
