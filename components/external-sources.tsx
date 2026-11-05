import { ExternalLinkIcon } from "lucide-react"
import {
  CATEGORY_LABEL,
  UNVERIFIED_NOTE,
  directoryBy,
  type DirectoryCategory,
  type DirectoryEntry,
} from "@/lib/providers/registry"

/**
 * The external site directory.
 *
 * Every card leaves the app, so every card says so — name, domain and an
 * external-link icon, never anything that reads as a play control. Groups
 * come from the registry, so adding a destination is a config change.
 */

const GROUPS: DirectoryCategory[] = ["official", "platform", "unverified"]

function SiteCard({ entry }: { entry: DirectoryEntry }) {
  return (
    <a
      href={entry.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${entry.name} — ${entry.domain}, opens in a new tab`}
      className="card-lift surface bg-card rounded-2xl px-4 py-3.5 flex items-center gap-3"
    >
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-[0.95rem] truncate">{entry.name}</span>
        <span className="stat-label block text-[0.65rem] truncate">{entry.domain}</span>
      </span>
      <ExternalLinkIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </a>
  )
}

export function ExternalSources() {
  return (
    <div className="flex flex-col gap-6">
      {GROUPS.map((category) => {
        const entries = directoryBy(category)
        if (entries.length === 0) return null
        return (
          <section key={category}>
            <h3 className="stat-label text-[0.65rem] mb-2.5">{CATEGORY_LABEL[category]}</h3>
            {category === "unverified" && (
              <p className="text-muted-foreground text-xs mb-2.5">{UNVERIFIED_NOTE}</p>
            )}
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 stagger">
              {entries.map((entry) => (
                <SiteCard key={entry.url} entry={entry} />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
