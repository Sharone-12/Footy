"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { LockIcon, EyeIcon, EyeOffIcon, AlertCircleIcon, Loader2Icon, TvIcon } from "lucide-react"

export function LivePasswordLock() {
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!password.trim() || loading) return

    setLoading(true)
    setError(null)

    try {
      const res = await fetch("/api/live/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || "Authentication failed. Please try again.")
        return
      }

      // Success: refresh the page so the server re-renders Live with the valid session cookie
      router.refresh()
    } catch {
      setError("Unable to connect to authentication service. Please check your connection.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="w-full max-w-md mx-auto my-8 animate-fade-in" role="main">
      <section
        aria-labelledby="live-lock-heading"
        className="surface bg-card/90 border border-border/80 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden"
      >
        {/* Subtle accent glow behind the badge */}
        <div
          className="absolute -top-12 -right-12 size-40 rounded-full blur-3xl opacity-20 pointer-events-none"
          style={{ backgroundColor: "var(--pitch)" }}
          aria-hidden="true"
        />

        {/* Lock / Broadcast Icon */}
        <div className="flex flex-col items-center text-center mb-6">
          <div
            className="size-16 rounded-2xl flex items-center justify-center mb-3.5 border shadow-inner"
            style={{
              backgroundColor: "rgba(0, 255, 135, 0.08)",
              borderColor: "rgba(0, 255, 135, 0.25)",
              color: "var(--pitch)",
            }}
          >
            <div className="relative">
              <TvIcon className="size-8" aria-hidden="true" />
              <div className="absolute -bottom-1 -right-1 size-4 rounded-full bg-background flex items-center justify-center border border-border">
                <LockIcon className="size-2.5 text-muted-foreground" aria-hidden="true" />
              </div>
            </div>
          </div>

          <h1
            id="live-lock-heading"
            className="text-2xl sm:text-3xl font-bold tracking-tight uppercase leading-none"
            style={{ fontFamily: "var(--font-condensed)" }}
          >
            LIVE &amp; STREAMING
          </h1>
          <p className="text-muted-foreground text-xs sm:text-sm mt-2 max-w-xs leading-relaxed">
            Protected live football broadcasts. Enter your access code to view active matches and provider streams.
          </p>
        </div>

        {/* Password Entry Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="space-y-1.5">
            <label
              htmlFor="live-password-input"
              className="stat-label text-xs font-semibold tracking-wider uppercase block"
            >
              Access Code
            </label>
            <div className="relative">
              <input
                id="live-password-input"
                name="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  if (error) setError(null)
                }}
                disabled={loading}
                autoFocus
                autoComplete="current-password"
                placeholder="Enter password..."
                className="w-full bg-background border border-border/80 focus:border-ring rounded-xl px-3.5 py-2.5 pr-10 text-sm font-sans tracking-wide text-foreground placeholder:text-muted-foreground/60 outline-none transition-colors"
                aria-required="true"
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "live-lock-error" : undefined}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1"
              >
                {showPassword ? (
                  <EyeOffIcon className="size-4" aria-hidden="true" />
                ) : (
                  <EyeIcon className="size-4" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          {/* Error Message Alert */}
          {error && (
            <div
              id="live-lock-error"
              role="alert"
              className="rounded-xl border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-xs text-destructive flex items-center gap-2 animate-fade-in"
            >
              <AlertCircleIcon className="size-4 shrink-0" aria-hidden="true" />
              <span className="leading-snug">{error}</span>
            </div>
          )}

          {/* Unlock Submit Button */}
          <button
            type="submit"
            disabled={loading || !password.trim()}
            className="w-full mt-1.5 py-2.5 px-4 rounded-xl text-sm font-semibold tracking-wide uppercase flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-primary-foreground bg-primary hover:opacity-90 shadow-md active:scale-[0.99]"
            style={{ fontFamily: "var(--font-condensed)" }}
          >
            {loading ? (
              <>
                <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
                <span>Verifying...</span>
              </>
            ) : (
              <>
                <LockIcon className="size-3.5" aria-hidden="true" />
                <span>Unlock Live Dashboard</span>
              </>
            )}
          </button>
        </form>

        {/* Session Security Details */}
        <footer className="mt-6 pt-4 border-t border-border/40 text-center">
          <p className="text-[0.7rem] text-muted-foreground/80 flex items-center justify-center gap-1.5">
            <span>Secure 12-hour HTTP-only session</span>
            <span aria-hidden="true">•</span>
            <span>FOOTYY Private Access</span>
          </p>
        </footer>
      </section>
    </main>
  )
}
