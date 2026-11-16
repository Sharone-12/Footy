"use client"

/**
 * The stand mosaic: "MÉS QUE UN CLUB" held up in gold cards against blaugrana
 * blocks, turned over a card at a time in a wave from the bottom corner, the
 * way the Camp Nou does it before kick-off.
 *
 * CSS-only motion. Every card is one span; the letters are a 5x5 pixel face
 * laid out below, so there is no image to load or font to wait for and the
 * words stay sharp at any width.
 *
 * A client component for its size, not for any interactivity: rendered on the
 * server either way, but as a client component its 800 spans are sent once,
 * as HTML, rather than a second time in the page's data payload.
 */

const GLYPHS: Record<string, string[]> = {
  M: ["10001", "11011", "10101", "10001", "10001"],
  E: ["11111", "10000", "11110", "10000", "11111"],
  S: ["01111", "10000", "01110", "00001", "11110"],
  Q: ["01110", "10001", "10101", "10010", "01101"],
  U: ["10001", "10001", "10001", "10001", "01110"],
  N: ["10001", "11001", "10101", "10011", "10001"],
  C: ["01111", "10000", "10000", "10000", "01111"],
  L: ["10000", "10000", "10000", "10000", "11111"],
  B: ["11110", "10001", "11110", "10001", "11110"],
}

const WORDS = ["MÉS", "QUE", "UN", "CLUB"]
const PAD = 3
const WORD_GAP = 3
const ROWS = 9
/** Letters sit on rows 3-7; row 1 carries the accent on the É. */
const TOP = 3
const BAND = 7

function layout() {
  const gold = new Set<string>()
  let x = PAD
  for (const word of WORDS) {
    for (const ch of word) {
      const accent = ch === "É"
      const rows = GLYPHS[accent ? "E" : ch]
      rows.forEach((row, y) => {
        for (let i = 0; i < 5; i++) if (row[i] === "1") gold.add(`${x + i},${TOP + y}`)
      })
      if (accent) {
        gold.add(`${x + 2},1`)
        gold.add(`${x + 3},1`)
      }
      x += 6
    }
    x += WORD_GAP - 1
  }
  const cols = x - WORD_GAP + PAD
  const tiles: { kind: "g" | "b" | "r"; delay: number }[] = []
  for (let y = 0; y < ROWS; y++) {
    for (let c = 0; c < cols; c++) {
      tiles.push({
        kind: gold.has(`${c},${y}`) ? "g" : Math.floor(c / BAND) % 2 === 0 ? "b" : "r",
        // The wave runs up from the bottom-left corner.
        delay: c + (ROWS - 1 - y) * 3,
      })
    }
  }
  return { cols, tiles }
}

const { cols, tiles } = layout()

export function Mosaic() {
  return (
    <div
      role="img"
      aria-label="Més que un club"
      className="mosaic mb-6 rounded-xl overflow-hidden"
      style={{ "--cols": cols } as React.CSSProperties}
    >
      {tiles.map((t, i) => (
        <span key={i} className={t.kind} style={{ "--d": t.delay } as React.CSSProperties} />
      ))}
    </div>
  )
}
