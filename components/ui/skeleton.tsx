import { cn } from "cn"

/**
 * A loading placeholder. One big enough to hold it gets a pitch being marked
 * out, line by line, instead of a blank pulsing box; the container query in
 * globals.css keeps the lines off small ones (a line of text, a pill), where
 * they would only be clutter.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("skeleton-pitch relative overflow-hidden animate-pulse rounded-md bg-muted", className)}
      {...props}
    >
      <svg
        aria-hidden
        viewBox="0 0 120 80"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 size-full"
        fill="none"
      >
        {/* Touchline, halfway line, centre circle, then both penalty areas. */}
        <rect x="6" y="6" width="108" height="68" pathLength={1} />
        <path d="M60 6v68" pathLength={1} />
        <circle cx="60" cy="40" r="11" pathLength={1} />
        <path d="M6 22h17v36H6M114 22H97v36h17" pathLength={1} />
      </svg>
    </div>
  )
}

export { Skeleton }
