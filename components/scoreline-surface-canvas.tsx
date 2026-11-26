"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { Color, type Mesh } from "three"
import { cssColor, cssToken } from "@/lib/css-color"
import { bandFor, type Band } from "@/lib/scorelines"

/**
 * The scoreline grid as a board that probability stands up out of.
 *
 * The table above is the authoritative version and says everything this does.
 * What the third dimension adds is shape: a distribution with one spike and a
 * distribution spread along a ridge are the same set of tinted squares until
 * you stand them up, and then they are obviously not the same forecast.
 *
 * Two channels, both carrying the same two facts the table carries. Height is
 * probability. Colour is the outcome band, faded toward the board by the same
 * square-rooted weight the table tints with — so the tail reads as the
 * near-nothing it is instead of shouting as loudly as the likeliest scoreline
 * just because both are tiles on the same board.
 *
 * Yaw only. Dragging spins the board so you can see behind a tall bar, which
 * is the one thing a fixed view actually prevents; a free camera would add
 * pitch, roll, zoom and four clamping bugs to solve a problem nobody has.
 */

/** Matches `BAND_COLOR` in `scoreline-grid.tsx`, resolved for WebGL. */
const BAND_EXPR: Record<Band, string> = {
  home: "oklch(0.80 0.19 150)",
  draw: "oklch(0.70 0.045 252)",
  away: "oklch(0.72 0.14 40)",
  mixed: "var(--muted-foreground)",
}

/** Tallest bar, in world units. The board is `n` units across. */
const PEAK = 2.2
/** So a zero cell is still a tile on the board rather than nothing. */
const FLOOR = 0.05
/** Colour a cell keeps at zero probability, before weight is added. */
const BASE_TINT = 0.12
/** Taller than this casts a shadow; below it, a tile would only self-shadow. */
const CASTS = 0.25

type Palette = Record<Band, string> & { board: string }

function readPalette(): Palette {
  return {
    home: cssColor(BAND_EXPR.home),
    draw: cssColor(BAND_EXPR.draw),
    away: cssColor(BAND_EXPR.away),
    mixed: cssToken("--muted-foreground"),
    board: cssToken("--border"),
  }
}

type Bar = {
  x: number
  z: number
  height: number
  color: Color
  casts: boolean
  /** Rings out from the likeliest scoreline, in cells. */
  delay: number
}

function layout(cells: number[][], last: number, palette: Palette): Bar[] {
  const n = cells.length
  const offset = (n - 1) / 2
  let peak = 1e-9
  let topH = 0
  let topA = 0
  for (let h = 0; h < n; h++) {
    for (let a = 0; a < cells[h].length; a++) {
      if (cells[h][a] > peak) {
        peak = cells[h][a]
        topH = h
        topA = a
      }
    }
  }

  const board = new Color(palette.board)
  const bars: Bar[] = []
  for (let h = 0; h < n; h++) {
    for (let a = 0; a < cells[h].length; a++) {
      const p = cells[h][a]
      const height = Math.max(FLOOR, (p / peak) * PEAK)
      const weight = Math.sqrt(Math.max(0, p) / peak)
      bars.push({
        x: a - offset,
        z: h - offset,
        height,
        color: board
          .clone()
          .lerp(new Color(palette[bandFor(h, a, last)]), BASE_TINT + (1 - BASE_TINT) * weight),
        casts: height > CASTS,
        delay: Math.hypot(h - topH, a - topA),
      })
    }
  }
  return bars
}

/** Entrance, in milliseconds: one bar's rise, and the gap between rings. */
const RISE = 620
const RING = 55

/**
 * The bars, and the one orchestrated moment this view gets.
 *
 * They grow out of the board in a ring spreading from the likeliest scoreline,
 * so the eye is on the spike before the tail arrives. It runs once, on the
 * click that opened the view, which is the only reason it is here: motion that
 * answers an action shows what changed, where motion on a loop is decoration.
 *
 * `frameloop="demand"` means there is no render loop to ride, so the frame
 * callback asks for the next frame itself and stops asking when the animation
 * is done. After that the scene costs nothing until something changes.
 */
function Bars({ bars, still }: { bars: Bar[]; still: boolean }) {
  const refs = useRef<(Mesh | null)[]>([])
  const start = useRef<number | null>(null)
  const invalidate = useThree((s) => s.invalidate)

  useFrame(() => {
    if (still) return
    if (start.current === null) start.current = performance.now()
    const t = performance.now() - start.current

    let running = false
    for (let i = 0; i < bars.length; i++) {
      const mesh = refs.current[i]
      if (!mesh) continue
      const local = (t - bars[i].delay * RING) / RISE
      if (local < 1) running = true
      const eased = 1 - Math.pow(1 - Math.min(1, Math.max(0, local)), 3)
      const s = Math.max(0.0001, eased)
      mesh.scale.y = s
      mesh.position.y = (bars[i].height * s) / 2
    }
    if (running) invalidate()
  })

  return (
    <>
      {bars.map((b, i) => (
        <mesh
          key={i}
          ref={(m) => {
            refs.current[i] = m
          }}
          position={[b.x, still ? b.height / 2 : 0, b.z]}
          scale={[1, still ? 1 : 0.0001, 1]}
          castShadow={b.casts}
        >
          <boxGeometry args={[0.74, b.height, 0.74]} />
          <meshStandardMaterial color={b.color} roughness={0.6} metalness={0} />
        </mesh>
      ))}
    </>
  )
}

/** Keep the scene still until something changes. */
function Redraw({ on }: { on: unknown }) {
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    invalidate()
  }, [invalidate, on])
  return null
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

  const still = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  )

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

  const bars = useMemo(
    () => (palette ? layout(cells, last, palette) : null),
    [cells, last, palette],
  )

  if (!palette || !bars) return null
  const n = cells.length

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
        shadows
        frameloop="demand"
        dpr={[1, 2]}
        camera={{ position: [0, 6, 8.6], fov: 30 }}
        // No alpha-to-black: the card shows through, so the board sits on the
        // surface it belongs to instead of in a grey box.
        gl={{ alpha: true, antialias: true }}
      >
        <Redraw on={`${yaw}|${palette.home}|${palette.board}`} />
        <ambientLight intensity={0.55} />
        {/* Raking, from the reader's left, so a bar's own height is legible
            from the shadow side rather than flat-lit. The biases are what keep
            the board from self-shadowing into a stipple under every tile. */}
        <directionalLight
          castShadow
          position={[-5, 9, 6]}
          intensity={2.1}
          shadow-mapSize={[1024, 1024]}
          shadow-bias={-0.0015}
          shadow-normalBias={0.06}
          shadow-camera-left={-6}
          shadow-camera-right={6}
          shadow-camera-top={6}
          shadow-camera-bottom={-6}
        />
        <directionalLight position={[4, 3, -5]} intensity={0.45} />

        <group rotation={[0, yaw, 0]} position={[0, -0.6, 0]}>
          {/* The board, so the empty corners still read as part of the grid.
              Its top sits just under zero: level with the bars' base, the two
              faces would z-fight into speckles across the flat tail. */}
          <mesh position={[0, -0.06, 0]} receiveShadow>
            <boxGeometry args={[n + 0.3, 0.08, n + 0.3]} />
            <meshStandardMaterial color={palette.board} roughness={1} metalness={0} />
          </mesh>
          <Bars bars={bars} still={still} />
        </group>
      </Canvas>
    </div>
  )
}
