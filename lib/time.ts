/**
 * Shared date and time formatting utilities configured for Indian Standard Time (IST).
 * Timezone: Asia/Kolkata (UTC+5:30).
 */

export const IST_TIMEZONE = "Asia/Kolkata"

/**
 * Formats a timestamp into a 24-hour IST time string.
 * e.g. "01:30" or "21:00"
 */
export function formatTimeIST(
  dateOrIso: string | number | Date,
  options?: { hour12?: boolean }
): string {
  const d =
    typeof dateOrIso === "string" || typeof dateOrIso === "number"
      ? new Date(dateOrIso)
      : dateOrIso
  if (Number.isNaN(d.getTime())) return "TBC"

  const hour12 = options?.hour12 ?? false
  return d.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: IST_TIMEZONE,
    hour12,
  })
}

/**
 * Formats a date into an IST date string.
 * e.g. "Sun, 9 Nov" or "Sunday, 9 November"
 */
export function formatDateIST(
  dateOrIso: string | number | Date,
  options?: {
    weekday?: "short" | "long"
    month?: "short" | "long"
    day?: "numeric" | "2-digit"
    year?: "numeric" | "2-digit"
  }
): string {
  const d =
    typeof dateOrIso === "string" || typeof dateOrIso === "number"
      ? new Date(dateOrIso)
      : dateOrIso
  if (Number.isNaN(d.getTime())) return ""

  return d.toLocaleDateString("en-IN", {
    weekday: options?.weekday ?? "short",
    day: options?.day ?? "numeric",
    month: options?.month ?? "short",
    year: options?.year,
    timeZone: IST_TIMEZONE,
  })
}

/**
 * Formats a fixture kickoff timestamp with fallback date into user-friendly IST string.
 * e.g., "Today, 01:30" or "Sun, 9 Nov, 01:30"
 */
export function formatKickoffIST(
  kickoff: string | null | undefined,
  fallbackDate?: string
): string {
  if (!kickoff) {
    if (!fallbackDate) return "TBC"
    const d = new Date(`${fallbackDate}T12:00:00Z`)
    return formatDateIST(d, { weekday: "short", day: "numeric", month: "short" })
  }

  const d = new Date(kickoff)
  if (Number.isNaN(d.getTime())) return "TBC"

  const todayStr = new Date().toLocaleDateString("en-IN", { timeZone: IST_TIMEZONE })
  const matchDayStr = d.toLocaleDateString("en-IN", { timeZone: IST_TIMEZONE })

  const timePart = formatTimeIST(d, { hour12: false })

  if (todayStr === matchDayStr) {
    return `Today, ${timePart}`
  }

  const datePart = formatDateIST(d, { weekday: "short", day: "numeric", month: "short" })
  return `${datePart}, ${timePart}`
}
