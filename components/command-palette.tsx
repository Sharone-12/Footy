"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { SearchIcon } from "lucide-react"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { searchPlayers, LEAGUE_CODES, type IndexedPlayer } from "@/lib/search"

const PAGES = [
  { href: "/", label: "Players", words: "home top scorers assists leaderboard" },
  { href: "/teams", label: "Teams", words: "standings tables power rankings table race justice xpts" },
  { href: "/teams/compare", label: "Compare teams", words: "versus head to head" },
  { href: "/signals", label: "Signals", words: "metrics scatter breakouts declines" },
  { href: "/predictions", label: "Predictions", words: "predict odds accuracy calibration" },
  { href: "/compare", label: "Compare players", words: "versus head to head" },
  { href: "/squad", label: "Barça squad", words: "barcelona fcb" },
  { href: "/squad/fixtures", label: "Barça fixtures", words: "barcelona schedule results" },
  { href: "/squad/leaders", label: "Barça leaders", words: "barcelona top stats" },
  { href: "/live", label: "Live", words: "scores streams watch" },
]

/**
 * ⌘K / Ctrl+K: jump to any page or player from anywhere.
 *
 * The player index is the same cached /api/players response the search box
 * uses, fetched the first time the palette opens rather than on every page.
 */
export function CommandPalette() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const [index, setIndex] = useState<IndexedPlayer[]>([])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  useEffect(() => {
    if (!open || index.length) return
    let live = true
    fetch("/api/players")
      .then((r) => r.json())
      .then((j) => live && setIndex(j.players ?? []))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [open, index.length])

  const players = useMemo(() => searchPlayers(index, q, 7), [index, q])
  const needle = q.trim().toLowerCase()
  const pages = PAGES.filter(
    (p) => !needle || `${p.label} ${p.words}`.toLowerCase().includes(needle),
  )

  const go = (href: string) => {
    setOpen(false)
    setQ("")
    router.push(href)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="pointer-events-auto nav-pill size-[36px] sm:size-[38px] flex items-center justify-center shrink-0 text-foreground/80 hover:text-foreground transition-all duration-200 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring select-none"
        aria-label="Search players and pages"
        title="Search (⌘K)"
      >
        <SearchIcon className="size-4 sm:size-[17px]" />
      </button>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Search"
        description="Jump to a player or a page"
      >
        {/* Ranking is ours (searchPlayers weighs minutes played), so cmdk's own filter is off. */}
        <Command shouldFilter={false}>
          <CommandInput value={q} onValueChange={setQ} placeholder="Search players or pages…" />
          <CommandList>
            <CommandEmpty>{index.length ? "Nothing matches." : "Loading players…"}</CommandEmpty>
            {players.length > 0 && (
              <CommandGroup heading="Players">
                {players.map((p) => (
                  <CommandItem key={p.s} value={`player-${p.s}`} onSelect={() => go(`/player/${p.s}`)}>
                    <span className="flex-1 truncate">{p.n}</span>
                    <span className="text-xs text-muted-foreground truncate">
                      {p.t} · {LEAGUE_CODES[p.l]}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {pages.length > 0 && (
              <CommandGroup heading="Pages">
                {pages.map((p) => (
                  <CommandItem key={p.href} value={`page-${p.href}`} onSelect={() => go(p.href)}>
                    {p.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  )
}
