/**
 * Fit the prediction model and write lib/model-params.json.
 *
 *   node scripts/fit-model.mjs
 *
 * This used to run inside the request, which cost /predictions about six
 * seconds on a cold cache: two seasons of matches and per-match stats read
 * back, then two coordinate-descent fits. None of it depends on the visitor
 * and all of it only changes when results do, so it belongs here beside the
 * twice-daily refresh, and the site just reads the answer.
 */
import { createClient } from "@supabase/supabase-js"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { fitLeagueParams, walkForward, DEFAULT_PARAMS } from "../lib/learn.ts"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const OUT = path.join(ROOT, "lib", "model-params.json")

const SEASONS = ["2026/27", "2025/26"]
const LEAGUES = ["Premier League", "La Liga", "Serie A", "Ligue 1", "Bundesliga"]
const STAT_MAP = {
  "Expected goals": "xg",
  "Shots on target": "sot",
  "Big chances": "bc",
  "Shots inside box": "sib",
  "Ball possession": "poss",
  "Goals prevented": "gp",
}
const STATS = Object.keys(STAT_MAP)
const MIN_TRAINING_MATCHES = 200

function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    const file = path.join(ROOT, name)
    if (!fs.existsSync(file)) continue
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      if (!line.includes("=") || line.trimStart().startsWith("#")) continue
      const i = line.indexOf("=")
      const key = line.slice(0, i).trim()
      if (!process.env[key]) {
        process.env[key] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "")
      }
    }
  }
}
loadEnv()

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
)

const parseRaw = (raw) => {
  if (!raw) return { value: null, pct: null }
  const v = raw.match(/^(-?[0-9]+\.?[0-9]*)/)
  const p = raw.match(/([0-9]+)%/)
  return { value: v ? Number(v[1]) : null, pct: p ? Number(p[1]) : null }
}

async function pageAll(fn) {
  const out = []
  for (let i = 0; ; i++) {
    const { data, error } = await fn(i * 1000, i * 1000 + 999)
    if (error) throw new Error(error.message)
    if (!data?.length) break
    out.push(...data)
    if (data.length < 1000) break
  }
  return out
}

async function load() {
  const rows = await pageAll((from, to) =>
    sb
      .from("matches")
      .select("event_id, league, season, date, home, away, home_goals, away_goals")
      .in("season", SEASONS)
      .in("league", LEAGUES)
      .eq("status", "finished")
      .order("date", { ascending: true })
      .order("event_id", { ascending: true })
      .range(from, to),
  )
  const played = rows.filter((m) => m.home_goals != null && m.away_goals != null)
  if (played.length === 0) return []

  const batches = []
  for (let i = 0; i < played.length; i += 120) {
    batches.push(played.slice(i, i + 120).map((m) => m.event_id))
  }
  const results = await Promise.all(
    batches.map((b) =>
      sb
        .from("match_stats")
        .select("event_id, stat, home, away")
        .in("event_id", b)
        .in("stat", STATS)
        .limit(1000),
    ),
  )

  const byEvent = new Map()
  for (const { data, error } of results) {
    if (error) throw new Error(error.message)
    for (const r of data ?? []) {
      const key = STAT_MAP[r.stat]
      if (!key) continue
      const e = byEvent.get(r.event_id) ?? { home: {}, away: {} }
      for (const side of ["home", "away"]) {
        const { value, pct } = parseRaw(r[side])
        const v = key === "poss" ? pct : value
        if (v != null) e[side][key] = v
      }
      byEvent.set(r.event_id, e)
    }
  }

  return played.map((m) => {
    const s = byEvent.get(m.event_id)
    return {
      event_id: m.event_id,
      season: m.season,
      league: m.league,
      date: m.date,
      home: m.home,
      away: m.away,
      homeGoals: m.home_goals,
      awayGoals: m.away_goals,
      homeStats: s?.home,
      awayStats: s?.away,
    }
  })
}

const started = Date.now()
const matches = await load()
console.log(`loaded ${matches.length} finished league matches`)

const season = SEASONS[0]
const prior = SEASONS[1]

let out
if (matches.length < MIN_TRAINING_MATCHES) {
  console.log("too few matches to learn from; keeping the hand-set model")
  out = { season, seasons: SEASONS, trained: 0, params: DEFAULT_PARAMS, tested: null }
} else {
  const params = fitLeagueParams(matches).params

  // The honest mark: fitted on the previous season alone, scored on this one.
  let tested = null
  const trainOnly = matches.filter((m) => m.season === prior)
  if (trainOnly.length >= MIN_TRAINING_MATCHES) {
    const honest = fitLeagueParams(trainOnly).params
    const learnt = walkForward(matches, honest, season)
    if (learnt.n > 0) {
      tested = { season, learnt, handSet: walkForward(matches, DEFAULT_PARAMS, season) }
    }
  }
  out = { season, seasons: SEASONS, trained: matches.length, params, tested }
}

out.fittedAt = new Date().toISOString()
fs.writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`)

console.log(`wrote ${path.relative(ROOT, OUT)} in ${((Date.now() - started) / 1000).toFixed(1)}s`)
console.log(
  "params:",
  Object.fromEntries(Object.entries(out.params).map(([k, v]) => [k, Number(v.toFixed(4))])),
)
if (out.tested) {
  console.log(
    `out of sample on ${out.tested.learnt.n} matches: ` +
      `${out.tested.handSet.logLoss.toFixed(4)} -> ${out.tested.learnt.logLoss.toFixed(4)}`,
  )
}
