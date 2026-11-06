"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { LockIcon, Loader2Icon } from "lucide-react"

export function LiveLockControl() {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleLock() {
    if (loading) return
    setLoading(true)
    try {
      await fetch("/api/live/logout", { method: "POST" })
      router.refresh()
    } catch (err) {
      console.error("Logout failed:", err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleLock}
      disabled={loading}
      aria-label="Lock Live section and end 12-hour session"
      title="Lock Live section"
      className="inline-flex items-center gap-1.5 self-start sm:self-auto px-3.5 py-1.5 rounded-full text-xs font-medium text-muted-foreground hover:text-foreground bg-card/60 hover:bg-card border border-border/60 transition-colors shadow-sm cursor-pointer disabled:opacity-50"
    >
      {loading ? (
        <>
          <Loader2Icon className="size-3.5 animate-spin" aria-hidden="true" />
          <span>Locking...</span>
        </>
      ) : (
        <>
          <LockIcon className="size-3.5 text-muted-foreground" aria-hidden="true" />
          <span>Lock Live</span>
        </>
      )}
    </button>
  )
}

