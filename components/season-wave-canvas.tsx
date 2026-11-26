"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { BufferAttribute, BufferGeometry, type Mesh } from "three"
import { cssColor, cssToken } from "@/lib/css-color"

/**
 * The season, standing up.
 *
 * The flat scarf above says which nights were won. It cannot say by how much,
 * and it cannot say whether a win looked like Barça or like a smash-and-grab —
 * the gold bars underneath carry that, but as a second chart the eye has to
 * cross-reference a stripe at a time.
 *
 * So both, in one object, the way a scarf is actually made: two threads. The
 * matches are discrete blocks along the season — colour for the result, height
 * for the margin, rising above the line for a win and hanging below it for a
 * defeat. Behind them the style ribbon runs continuously, its top edge
 * following how Barça-like each night was.
 *
 * Discrete against continuous is the whole point of the pairing. A result is
 * an event that happened once; style is a quality that carries between
 * matches. Drawing them in the same form — which is what a second row of bars
 * would do — makes a picket fence where the eye cannot tell which thread it is
 * reading.
 */

export type WaveMatch = {
  /** Goal difference, from Barça's side. Negative is a defeat. */
  gd: number
  result: "W" | "D" | "L"
  /** 0-100, or null before there are enough matches to average. */
  like: number | null
}

/** Blaugrana, as on the flat scarf: a winning run reads as the shirt. */
const BLAU = "#1B3F8F"
const GRANA = "#A50044"
const GOLD = "#EDBB00"

/** How wide the season is drawn, in world units. */
const SPAN = 10.2
/** World units per goal of margin. */
const GOAL = 0.42
/** A draw has no margin, so it still needs a body to be a block at all. */
const SLAB = 0.07
/** The style ribbon at 100. */
const LIKE = 1.25

type Palette = { draw: string; loss: string; rail: string }

function readPalette(): Palette {
  return {
    draw: cssColor("oklch(0.58 0 0)"),
    loss: cssColor("oklch(0.22 0.02 260)"),
    rail: cssToken("--muted-foreground"),
  }
}

type Block = {
  x: number
  /** Settled centre height: positive above the line, negative below. */
  y: number
  height: number
  width: number
  color: string
}

/**
 * The ribbon as a triangle strip, and its top edge as a line.
 *
 * Built by hand rather than with a curve helper: there are at most a few dozen
 * points, they are already in order, and an extrude would need the same array
 * plus a shape to sweep along it.
 */
function ribbonGeometry(points: [number, number][]): {
  surface: BufferGeometry
  edge: BufferGeometry
} {
  const tri: number[] = []
  const line: number[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i]
    const [x1, y1] = points[i + 1]
    tri.push(x0, 0, 0, x1, 0, 0, x1, y1, 0)
    tri.push(x0, 0, 0, x1, y1, 0, x0, y0, 0)
    line.push(x0, y0, 0, x1, y1, 0)
  }
  const surface = new BufferGeometry()
  surface.setAttribute("position", new BufferAttribute(new Float32Array(tri), 3))
  surface.computeVertexNormals()
  const edge = new BufferGeometry()
  edge.setAttribute("position", new BufferAttribute(new Float32Array(line), 3))
  return { surface, edge }
}

/** Entrance, in milliseconds: one block's rise, and the gap between matches. */
const RISE = 420
const STEP = 34

/**
 * The season unrolling, left to right, once.
 *
 * Chronological because that is the one order this data has: the cascade is
 * the season being played, not decoration. It runs when the section is first
 * scrolled to, and never again.
 */
function Blocks({ blocks, still }: { blocks: Block[]; still: boolean }) {
  const refs = useRef<(Mesh | null)[]>([])
  const start = useRef<number | null>(null)
  const invalidate = useThree((s) => s.invalidate)

  useFrame(() => {
    if (still) return
    if (start.current === null) start.current = performance.now()
    const t = performance.now() - start.current

    let running = false
    for (let i = 0; i < blocks.length; i++) {
      const mesh = refs.current[i]
      if (!mesh) continue
      const local = (t - i * STEP) / RISE
      if (local < 1) running = true
      const eased = 1 - Math.pow(1 - Math.min(1, Math.max(0, local)), 3)
      const s = Math.max(0.0001, eased)
      mesh.scale.y = s
      mesh.position.y = blocks[i].y * s
    }
    if (running) invalidate()
  })

  return (
    <>
      {blocks.map((b, i) => (
        <mesh
          key={i}
          ref={(m) => {
            refs.current[i] = m
          }}
          position={[b.x, still ? b.y : 0, 0.55]}
          scale={[1, still ? 1 : 0.0001, 1]}
          castShadow
        >
          <boxGeometry args={[b.width, b.height, 0.5]} />
          <meshStandardMaterial color={b.color} roughness={0.5} metalness={0.02} />
        </mesh>
      ))}
    </>
  )
}

function Redraw({ on }: { on: unknown }) {
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    invalidate()
  }, [invalidate, on])
  return null
}

export default function SeasonWaveCanvas({ matches }: { matches: WaveMatch[] }) {
  const [yaw, setYaw] = useState(0)
  const [palette, setPalette] = useState<Palette | null>(null)
  const drag = useRef<{ x: number; yaw: number } | null>(null)

  const still = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  )

  // The palette is defined in CSS, so the only honest way to read it is to ask
  // the document — and again whenever the theme class on <html> flips.
  useEffect(() => {
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

  const { blocks, ribbon } = useMemo(() => {
    const n = Math.max(1, matches.length)
    const step = SPAN / n
    const half = SPAN / 2
    let wins = 0
    const out: Block[] = []
    const points: [number, number][] = []

    matches.forEach((m, i) => {
      const x = -half + step * (i + 0.5)
      const height = Math.max(SLAB, Math.abs(m.gd) * GOAL)
      const sign = m.gd > 0 ? 1 : m.gd < 0 ? -1 : 0
      out.push({
        x,
        y: sign === 0 ? 0 : (sign * height) / 2,
        height,
        width: step * 0.78,
        color:
          m.result === "W"
            ? wins++ % 2 === 0
              ? BLAU
              : GRANA
            : m.result === "D"
              ? (palette?.draw ?? "#808080")
              : (palette?.loss ?? "#222222"),
      })
      // A match with no style score yet sits on the floor rather than being
      // skipped: a gap in the array would let the ribbon span it and claim a
      // reading between two nights that was never taken.
      points.push([x, Math.max(0.05, ((m.like ?? 0) / 100) * LIKE)])
    })

    return { blocks: out, ribbon: ribbonGeometry(points) }
  }, [matches, palette])

  if (!palette) return null

  return (
    <div
      className="h-[200px] sm:h-[240px] -mx-1 touch-pan-y cursor-grab active:cursor-grabbing"
      // Every match in here is a link in the scarf above, with its own label.
      // This is a second view of the same season, so it stays out of the
      // accessibility tree rather than repeating all of it without the links.
      aria-hidden
      onPointerDown={(e) => {
        drag.current = { x: e.clientX, yaw }
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => {
        if (!drag.current) return
        // Clamped: past about a third of a turn the season is edge-on and the
        // blocks occlude each other into a single stripe.
        const next = drag.current.yaw + (e.clientX - drag.current.x) * 0.006
        setYaw(Math.max(-0.6, Math.min(0.6, next)))
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
        camera={{ position: [0, 6.4, 6.4], fov: 34 }}
        gl={{ alpha: true, antialias: true }}
      >
        <Redraw on={`${yaw}|${palette.rail}|${matches.length}`} />
        <ambientLight intensity={0.6} />
        {/* Raking from the left, so a block's height is legible from its own
            shadow rather than flat-lit. The biases keep the blocks from
            self-shadowing into a stipple. */}
        <directionalLight
          castShadow
          position={[-6, 9, 7]}
          intensity={2}
          shadow-mapSize={[1024, 1024]}
          shadow-bias={-0.0015}
          shadow-normalBias={0.06}
          shadow-camera-left={-10}
          shadow-camera-right={10}
          shadow-camera-top={8}
          shadow-camera-bottom={-8}
        />
        <directionalLight position={[5, 3, -6]} intensity={0.4} />

        <group rotation={[0, yaw, 0]}>
          {/* The line a season is measured from: above it a win, below it a
              defeat. Without it the hanging blocks read as a second row. */}
          <mesh position={[0, 0, 0.82]}>
            <boxGeometry args={[SPAN + 0.6, 0.02, 0.035]} />
            <meshStandardMaterial color={palette.rail} roughness={1} />
          </mesh>

          <group position={[0, 0, -0.75]}>
            <mesh geometry={ribbon.surface}>
              <meshStandardMaterial
                color={GOLD}
                roughness={0.6}
                metalness={0.05}
                transparent
                opacity={0.5}
                side={2}
              />
            </mesh>
            <lineSegments geometry={ribbon.edge}>
              <lineBasicMaterial color={GOLD} />
            </lineSegments>
          </group>

          <Blocks blocks={blocks} still={still} />
        </group>
      </Canvas>
    </div>
  )
}
