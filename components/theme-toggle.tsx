"use client"

import { useEffect, useState } from "react"
import { SunIcon, MoonIcon } from "lucide-react"

export function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">("light")
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const isDark = document.documentElement.classList.contains("dark")
    setTheme(isDark ? "dark" : "light")
  }, [])

  function toggleTheme() {
    const nextTheme = theme === "dark" ? "light" : "dark"
    setTheme(nextTheme)

    if (nextTheme === "dark") {
      document.documentElement.classList.add("dark")
      document.documentElement.setAttribute("data-theme", "dark")
      document.documentElement.style.colorScheme = "dark"
    } else {
      document.documentElement.classList.remove("dark")
      document.documentElement.setAttribute("data-theme", "light")
      document.documentElement.style.colorScheme = "light"
    }

    try {
      localStorage.setItem("footyy-theme", nextTheme)
    } catch {
      // ignore
    }
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="pointer-events-auto nav-pill size-[34px] sm:size-[38px] flex items-center justify-center shrink-0 text-foreground/80 hover:text-foreground transition-all duration-200 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring select-none"
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
    >
      {!mounted ? (
        <span className="size-4 opacity-0" aria-hidden />
      ) : theme === "dark" ? (
        <SunIcon className="size-4 sm:size-[17px] text-amber-300 hover:text-amber-200 transition-transform duration-300 hover:rotate-45" />
      ) : (
        <MoonIcon className="size-4 sm:size-[17px] text-slate-700 hover:text-black transition-transform duration-300 hover:-rotate-12" />
      )}
    </button>
  )
}

