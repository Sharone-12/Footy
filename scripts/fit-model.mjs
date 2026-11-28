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
import { dailyFit, fitLeagueParams, walkForward, DEFAULT_PARAMS } from "../lib/learn.ts"
// The site's own season list: a rollover edited there must not leave this
// script fitting last season, which `loadModelFit` answers by silently
// reverting the whole site to the hand-set model.
import { SEASONS as SITE_SEASONS } from "../lib/seasons.ts"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const OUT = path.join(ROOT, "lib", "model-params.json")
const HISTORY = path.join(ROOT, "lib", "model-history.json")

const SEASONS = [...SITE_SEASONS]
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

// How much recent football is kept out of the fit to judge it on. Three weeks
// is ~100 matches across the five leagues: enough that a log-loss gap means
// something, short enough that the shipped fit is never far behind the data.
const HOLDOUT_DAYS = 21
const MIN_HOLDOUT = 30
// Rows of the learning log. Two refreshes a day, so ~two months of verdicts.
const HISTORY_KEEP = 120

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

const readJson = (file, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"))
  } catch {
    return fallback
  }
}

/**
 * What is live on the site right now, and so what a new fit has to beat.
 *
 * A file fitted for another season is not an incumbent — it would be judged
 * on matches its parameters were never about — so that starts over from the
 * hand-set model, which is what the site is serving in that case anyway.
 */
const stored = readJson(OUT, null)
const incumbent =
  stored?.season === season && stored?.trained > 0 && stored?.params
    ? stored.params
    : DEFAULT_PARAMS

let out
let gate = null
if (matches.length < MIN_TRAINING_MATCHES) {
  console.log("too few matches to learn from; keeping the hand-set model")
  out = { season, seasons: SEASONS, trained: 0, params: DEFAULT_PARAMS, tested: null }
} else {
  // The day's lesson, and the verdict on it. The rule itself lives in
  // lib/learn.ts beside the model it adjusts, where `node lib/learn.test.ts`
  // can hold it to account without a database.
  const day = dailyFit(matches, incumbent, {
    season,
    holdoutDays: HOLDOUT_DAYS,
    minTrain: MIN_TRAINING_MATCHES,
    minHoldout: MIN_HOLDOUT,
  })
  const params = day.params
  gate = day.gate

  // The headline mark, unchanged: parameters fitted on the previous season
  // alone, scored on this one, against the settings that were chosen by hand.
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

// ── Writing ──
//
// Only when the model itself moved. Every run would otherwise rewrite the file
// with nothing but a new `fittedAt`, and the refresh would commit and push a
// no-op twice a day.
const body = (o) => JSON.stringify({ ...o, fittedAt: undefined })
if (!stored || body(stored) !== body(out)) {
  fs.writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`)
  console.log(`wrote ${path.relative(ROOT, OUT)}`)
} else {
  console.log(`${path.relative(ROOT, OUT)} unchanged`)
}

// The learning log: one row per run, kept whatever the verdict. A rejection is
// as much a result as an acceptance, and a run of them is the signal that the
// parameters have settled.
if (gate) {
  const history = readJson(HISTORY, [])
  history.push({
    at: out.fittedAt,
    ...gate,
    params: Object.fromEntries(
      Object.entries(out.params).map(([k, v]) => [k, Number(v.toFixed(4))]),
    ),
  })
  fs.writeFileSync(
    HISTORY,
    `${JSON.stringify(history.slice(-HISTORY_KEEP), null, 2)}\n`,
  )
}

console.log(`fitted in ${((Date.now() - started) / 1000).toFixed(1)}s`)
console.log(
  "params:",
  Object.fromEntries(Object.entries(out.params).map(([k, v]) => [k, Number(v.toFixed(4))])),
)
if (gate) {
  const g = gate
  console.log(
    `held out ${g.n} matches since ${g.from}: ` +
      `live ${g.incumbent.toFixed(4)} vs new ${g.candidate.toFixed(4)} -> ` +
      (g.accepted ? "ACCEPTED, parameters updated" : "rejected, keeping live parameters"),
  )
}
if (out.tested) {
  console.log(
    `out of sample on ${out.tested.learnt.n} matches: ` +
      `${out.tested.handSet.logLoss.toFixed(4)} -> ${out.tested.learnt.logLoss.toFixed(4)}`,
  )
}
