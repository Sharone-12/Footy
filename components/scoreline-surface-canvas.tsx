"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Canvas, useThree } from "@react-three/fiber"
import { cssColor, cssToken } from "@/lib/css-color"
import { bandFor, type Band } from "@/lib/scorelines"

/**
 * The scoreline grid as a landscape.
 *
 * The table above it is the authoritative version and says everything this
 * does. What the third dimension adds is shape: a distribution with one spike
 * and a distribution spread over a ridge are the same set of tinted squares
 * until you stand them up, and then they are obviously not the same forecast.
 * Height is probability and nothing else; colour is the outcome band and
 * nothing else — one variable per channel, so there is nothing to decode.
 *
 * Yaw only. Dragging spins the landscape so you can see behind a tall bar,
 * which is the one thing a fixed view actually prevents; a free camera would
 * add pitch, roll, zoom and four clamping bugs to solve a problem nobody has.
 */

/** Matches `BAND_COLOR` in `scoreline-grid.tsx`, resolved for WebGL. */
const BAND_EXPR: Record<Band, string> = {
  home: "oklch(0.80 0.19 150)",
  draw: "oklch(0.70 0.045 252)",
  away: "oklch(0.72 0.14 40)",
  mixed: "var(--muted-foreground)",
}

/** Tallest bar, in world units. The plate is `n` units across. */
const PEAK = 1.6
/** So a zero cell is still a tile on the plate rather than nothing. */
const FLOOR = 0.02

type Palette = Record<Band, string> & { plate: string }

function readPalette(): Palette {
  return {
    home: cssColor(BAND_EXPR.home),
    draw: cssColor(BAND_EXPR.draw),
    away: cssColor(BAND_EXPR.away),
    mixed: cssToken("--muted-foreground"),
    plate: cssToken("--border"),
  }
}

/**
 * Keep the scene still until something changes.
 *
 * `frameloop="demand"` means no render loop at all — no battery spent holding
 * a static picture, which is most of this component's life. React commits
 * invalidate on their own; the theme toggle changes no React state here, so
 * the palette effect below asks for the one frame it needs.
 */
function Redraw({ on }: { on: unknown }) {
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    invalidate()
  }, [invalidate, on])
  return null
}

function Bars({
  cells,
  last,
  palette,
  peak,
}: {
  cells: number[][]
  last: number
  palette: Palette
  peak: number
}) {
  const n = cells.length
  const offset = (n - 1) / 2

  return (
    <>
      {/* The footprint, so the empty corners still read as part of the grid. */}
      <mesh position={[0, -0.03, 0]} receiveShadow={false}>
        <boxGeometry args={[n, 0.06, n]} />
        <meshStandardMaterial color={palette.plate} roughness={0.95} />
      </mesh>

      {cells.map((row, h) =>
        row.map((p, a) => {
          const height = Math.max(FLOOR, (p / peak) * PEAK)
          const band = bandFor(h, a, last)
          return (
            <mesh
              key={`${h}-${a}`}
              position={[a - offset, height / 2, h - offset]}
            >
              <boxGeometry args={[0.82, height, 0.82]} />
              <meshStandardMaterial
                color={palette[band]}
                roughness={0.45}
                metalness={0.05}
              />
            </mesh>
          )
        }),
      )}
    </>
  )
}

export default function ScorelineSurfaceCanvas({
  cells,
  last,
}: {
  cells: number[][]
  last: number
}) {
  const [yaw, setYaw] = useState(-0.5)
  const [palette, setPalette] = useState<Palette | null>(null)
  const drag = useRef<{ x: number; yaw: number } | null>(null)

  const peak = useMemo(() => Math.max(...cells.flat(), 1e-9), [cells])

  // Resolve on the client, where the stylesheet exists, and again whenever the
  // theme class on <html> flips — the palette is defined in CSS, so the only
  // honest way to read it is to ask the document.
  useEffect(() => {
    // Only swap state when a colour actually changed. The observer also fires
    // for the inline styles other code sets on <html> — a scroll lock when a
    // dialog opens, for one — and each of those would otherwise rebuild every
    // material and ask for a frame for no reason.
    const read = () =>
      setPalette((prev) => {
        const next = readPalette()
        if (prev && (Object.keys(next) as (keyof Palette)[]).every((k) => prev[k] === next[k])) {
          return prev
        }
        return next
      })
    read()
    const observer = new MutationObserver(read)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    })
    return () => observer.disconnect()
  }, [])

  if (!palette) return null

  return (
    <div
      className="h-[260px] sm:h-[300px] -mx-1 touch-pan-y cursor-grab active:cursor-grabbing"
      // The table carries every number in here, so this is a second view of
      // data already available rather than content of its own. Hidden from
      // assistive tech, and deliberately not focusable: making a drag-only
      // canvas a tab stop would promise keyboard control it does not have.
      aria-hidden
      onPointerDown={(e) => {
        drag.current = { x: e.clientX, yaw }
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => {
        if (!drag.current) return
        setYaw(drag.current.yaw + (e.clientX - drag.current.x) * 0.008)
      }}
      onPointerUp={(e) => {
        drag.current = null
        e.currentTarget.releasePointerCapture(e.pointerId)
      }}
      onPointerCancel={() => {
        drag.current = null
      }}
    >
      <Canvas
        frameloop="demand"
        dpr={[1, 2]}
        camera={{ position: [0, 6.4, 8.2], fov: 32 }}
        // No alpha-to-black: the card shows through, so the landscape sits on
        // the surface it belongs to instead of in a grey box.
        gl={{ alpha: true, antialias: true }}
      >
        <Redraw on={`${yaw}|${palette.home}|${palette.plate}`} />
        <ambientLight intensity={1.1} />
        {/* Raking, from the reader's left, so a bar's own height is legible
            from the shadow side rather than flat-lit. */}
        <directionalLight position={[-5, 8, 6]} intensity={1.5} />
        <directionalLight position={[4, 3, -5]} intensity={0.35} />
        <group rotation={[0, yaw, 0]}>
          <Bars cells={cells} last={last} palette={palette} peak={peak} />
        </group>
      </Canvas>
    </div>
  )
}
