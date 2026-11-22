# footyy

A football statistics site built around Barcelona and the five leagues that feed
the Champions League. It keeps its own database, rates every upcoming match,
writes its predictions down before kickoff, and marks itself against them
afterwards.

Next.js 16 (App Router, Cache Components) · React 19 · Supabase · Tailwind v4 ·
a Python scraper on a schedule.

---

## Contents

- [Running it](#running-it)
- [Where the numbers come from](#where-the-numbers-come-from)
- [Predictions](#predictions)
- [How the model learns](#how-the-model-learns)
- [The season simulator](#the-season-simulator)
- [The Barça pages](#the-barça-pages)
- [Players](#players)
- [Signals](#signals)
- [Teams](#teams)
- [Live](#live)
- [What it does not do](#what-it-does-not-do)
- [Project layout](#project-layout)
- [Tests](#tests)

---

## Running it

```bash
npm install
cp .env.example .env.local     # fill in the Supabase values at minimum
npm run dev
```

The site reads from Supabase, so `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY` are required for anything to render.
`SUPABASE_SERVICE_ROLE_KEY` is only needed to write frozen predictions.
Everything else in `.env.example` belongs to the live and streaming section; the
rest of the site works without it.

The scraper is separate and optional:

```bash
pip install -r requirements.txt
python refresh.py              # fetch, rebuild CSVs, commit and push
python refresh.py --no-push    # leave the commit local
```

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |

---

## Where the numbers come from

One scraper, four tables, two runs a day. Nothing on the site is typed in by
hand.

**The feed.** Match results, per-match team statistics and per-player season
totals are scraped from Sofascore by `data_loader.py`. `refresh.py` runs it on a
schedule through launchd, using a persistent browser profile so the bot check
stays solved between runs, then rebuilds the processed CSVs, pushes rows to
Supabase via `sync_db.py` and commits the result.

**What is stored.** Four tables, and the whole site is built from them:

| Table | One row per | Holds |
|---|---|---|
| `matches` | fixture | competition, round, date, kickoff, both sides, score once it exists |
| `match_stats` | statistic per match | both teams' values — xG, possession, shots, big chances, duels, distance, ~40 more |
| `players` | player per competition per season | season totals and per-90 rates |
| `predictions` | fixture | what the model said, written before kickoff |

**Coverage.** The Premier League, La Liga, Serie A, Ligue 1 and the Bundesliga
are carried in full, so their standings are real standings, and so is the
Champions League. Anything else that appears — a cup tie, an international —
rides in on a tracked club's calendar and is deliberately kept out of anything
that needs a season of form behind it.

A player holds a separate row per competition. Pages that rank players fold
those rows together and recompute rates from the combined totals, because a
league rate and a Champions League rate rest on different minutes and cannot
simply be averaged.

---

## Predictions

A goals model, not a results model. It works out how many goals each side should
score, then reads the win, draw and loss chances off that.

**Rating a match.** Each club gets an attack and a defence rating from its season
so far, measured against its own league's average. Attack leans mostly on
expected goals rather than goals scored, because finishing swings far more than
chance creation does. Defence starts from goals conceded, adjusted by the
keeper's goals prevented. The ratings multiply against each other to give both
sides an expected goal count, nudged by shot quality, the possession gap and
home advantage. Those two numbers go through a Poisson, giving every scoreline a
probability, which sums into home win, draw and away win.

**The draw correction.** Treating two teams' scoring as independent is wrong at
low scorelines, and wrong in a specific direction: too few 0-0s and 1-1s. That
is where this kind of model loses draws. A Dixon-Coles correction adjusts
exactly those four scorelines and leaves the rest alone. Its size is fitted, not
assumed.

**The Champions League is modelled separately.** A club plays one or two European
games before its odds matter, far too few to rate it on. So a European rating
blends three things: its games in the competition, its domestic form where that
league is carried, and an average European side, so a thin record is pulled
toward the middle. Backtested on the 2025/26 league phase, 144 matches, by
log-loss:

| Approach | Log-loss |
|---|---|
| European record alone, unshrunk | 1.109 |
| Every team rated average | 1.028 |
| European record, shrunk | 0.976 |
| Plus domestic form (ships) | 0.959 |

On the next season's opening round, which those settings never saw: 0.879
against 0.962 for rating everyone average.

**Receipts.** A prediction is written to the database and shown with its match
forever after. Until kickoff it is free to move and is refreshed whenever the
model changes its mind; at kickoff it locks and never changes again. That is
what makes the accuracy tracker honest — every settled match displays what was
actually said beforehand, not what the current model would say with the result
in hand.

**Calibration, not just hit rate.** Hit rate alone cannot tell you whether a
model is good: one calling every favourite at 90% and one calling them at 55%
score identically when the favourite wins. So predictions are grouped by stated
confidence and checked against how often they came in. The tick on each bar is
the confidence claimed, the bar is how often it was right. Bar past the tick
means it undersold itself; short of it means overconfidence.

---

## How the model learns

The settings behind the model used to be chosen by hand. They are fitted to
results now, and refitted as results arrive.

A model like this carries a dozen judgement calls — what a home ground is worth,
how far to trust xG over goals, what an above-average shot count really says.
Picked by hand, those numbers never improve and nothing checks whether they were
right.

**Walking the season forward.** Every finished league match is replayed in date
order. Each is predicted using only the record that existed before it kicked
off, and scored on log-loss. Then it is folded into the record and the next
match is predicted. This matters: a fit measured over a finished season has
already seen the answers, while a walk forward only ever grades the call the
model would genuinely have made at kickoff. Coordinate descent then settles on
the settings that would have called the season best.

**What it found.** Fitted on the previous season alone, then marked on 433
matches of the current one that those settings never saw:

| | Log-loss | Brier | Called right |
|---|---|---|---|
| Hand-set | 1.0288 | 0.6138 | 51.7% |
| Learnt | 0.9756 | 0.5811 | 51.3% |

Skill against a coin flip rises from 6.4% to 11.2%. It picks almost no more
winners — the gain is in how sure it is, which is most of what a prediction is
worth.

The largest single correction was to its own confidence: team ratings are pulled
roughly 45% of the way back toward an average scoreline, because the old version
was consistently too bold. Home advantage nearly doubled, trust in expected
goals rose, and the goals-prevented term was switched off entirely as noise.

**Why the previous season stays in the training set.** Tested by holding out the
back half of the current season and scoring all four options on exactly those
matches:

| Trained on | Skill vs coin flip |
|---|---|
| Nothing (hand-set) | 7.3% |
| Current season only | 8.9% |
| Previous season only | 12.2% |
| Both (ships) | 11.9% |

Fitted on the current season's 202 usable matches alone, the model decides home
advantage is 0.05 and gives big chances and shots inside the box *negative*
coefficients. That is 202 matches of noise being read as football. A club's own
form never carries across seasons — the ledger is keyed by season. Only the
general parameters are learnt from older data, and those do not reset in August.

---

## The season simulator

Plays the rest of the season out, match by match, from the same ratings the
predictions use.

**A match.** A simulated scoreline is a draw from the same expected goals the
odds are priced on: two Poisson draws, one per side. Goals are then handed to
players, with scorers drawn from the club's own season weighted by goals,
assists and minutes, so the striker scores more often than the full-back without
anyone hard-coding it. Roughly a quarter are left unassisted, about the real
rate once penalties and solo goals are counted.

**Round by round.** Advance a matchday at a time or let it run. The table
reorders as results land, fixtures fill in with scorelines and scorers, and a
running top scorer and assister build across the season.

**The Champions League bracket.** Once the league phase finishes the bracket is
drawn the way UEFA actually draws it rather than at random. The top eight go
straight to the last sixteen. Ninth to twenty-fourth play off in fixed bands,
9/10 against 23/24 down to 15/16 against 17/18, seeded side at home in the
second leg. Each pair of top seeds meets one band's winners, and the halves are
laid out so 1/2 can only meet 7/8 at the quarter-final stage. Ties are two legs
on aggregate, extra time when level, penalties settled by a weighted coin on the
rating gap. You step through a round at a time.

---

## The Barça pages

**Season scarf.** One stripe per match, oldest on the left: blaugrana for a win,
grey for a draw, black for a defeat. Every competition, in order.

**Did we play like Barça?** Bars under the scarf score each match out of 100 on
how much it looked like Barcelona's own football — possession, accurate passes,
final-third entries, big chances, expected goals. Each stat is measured against
the team's *own* season average rather than the league's. Against the league
Barça play like Barça every week; the interesting question is which weeks they
did not. 50 is a typical night and a standard deviation across the board is
worth 25 points.

**Title race.** The points gap to the nearest rivals after every round, with a
dashed line alongside showing what the gap would be on expected points, so a
lead built on finishing looks different from one built on chances.

**Next opponent.** The upcoming side ranked inside their own league on points
per game, goals scored and conceded, chances created and allowed, and
possession. Red marks where they are strong, green where they can be got at.
Their main threat is whoever has had a hand in the most goals.

**Most-used eleven.** The squad in a 4-3-3 by minutes played. Picked on minutes
because that is what the data can vouch for — it is who has played most, not a
predicted line-up, and the page says so.

**Fixtures and form.** Upcoming matches and recent results with the xG,
possession and shot count from each night, always Barça-first. A match that
finished without a score is treated as postponed rather than a draw, so it never
lands in the form run.

**Leaders.** Squad leaderboards grouped by the role a player actually fills
rather than the broad position — centre-back separated from full-back, winger
from midfielder, because clearances mean nothing when a full-back and a
centre-back share a column. Per-90 boards need 180 minutes before anyone
appears.

---

## Players

Style, not quality. Two players match when they play the same way, whatever
their output.

**Player DNA.** Every outfielder gets a fingerprint: per-90 rates turned into
z-scores against everyone else in the cohort. The vector says "does more of this
and less of that than average", which describes shape rather than standard.
Similarity is cosine rather than distance, deliberately — a quiet season of the
same kind of football still points the same direction, so it still reads as the
same kind of player.

**Archetypes.** Each fingerprint is matched against ten named profiles and the
closest is shown: Poacher, Target Forward, Wide Carrier, Creator, Deep
Playmaker, Box-to-Box, Ball-Winner, Stopper, Ball-Playing Defender, Attacking
Full-Back. Goalkeepers get none, and nobody is labelled before 270 minutes.

**Percentiles and comparison.** Stats shown as percentiles against the player's
own position group, so a defender is judged against defenders. Players can be
put side by side on the same axes, as totals or per 90.

---

## Signals

Five derived measures that are not in the feed, each built from columns the
database already holds.

| Signal | Formula |
|---|---|
| Finishing Edge | `goals − xG, per 90` |
| Ball Security | `dispossessed ÷ touches × 100` |
| Progressive Touch % | `(dribbles + final-third passes) ÷ touches` |
| Creator Index | `xA + big chances created + ½ key passes` |
| Ball-Winning Volume | `tackles + interceptions + aerials won, per 90` |

**Finishing Edge** is how far ahead of their chances someone is finishing.
Positive over a long run suggests genuine finishing; over a short one it mostly
suggests luck.

**Ball Security** is losses per hundred touches — a raw count of times
dispossessed punishes anyone who sees a lot of the ball.

**Progressive Touch %** separates players who circulate from players who
advance.

**Creator Index** weights chance creation by how good the chance was, rather
than counting every key pass the same.

**Ball-Winning Volume** is labelled volume rather than dominance on purpose. The
honest version is a win rate — duels won over duels contested — but the attempt
columns that needs come back empty from the feed. Until that is fixed a count is
all the data supports, and a count tracks position.

The page also tracks the biggest movers against last season, in both directions.

---

## Teams

**Power rankings.** Clubs ranked on underlying performance rather than points,
top five shown and the rest behind an expander. Any two can be compared on the
same radar axes.

**Owed points.** Every match's expected goals go through the same Poisson the
predictions use, giving both sides an expected points figure for that night.
Summed across a season, that is what a club deserved from the chances it created
and allowed.

```
points − expected points = how far a club is running ahead of its chances
```

Only matches with expected goals count, and they count for *both* columns —
comparing expected points from nine matches against real points from eleven
would report two games' worth of points as luck.

**Table race.** The season replayed round by round. Keyed by round rather than
date, so a postponed fixture lands in the round it belongs to and the table at
round nine is the one people remember.

---

## Live

Matches are bucketed into in-play, starting soon and upcoming from their kickoff
time, because the feed only ever says `upcoming` or `finished` and never `live`.
A fixture counts as in play for two hours from kickoff.

Any fixture opens to a full breakdown: the model's reasoning, both sides' season
form, head-to-head statistics once played, and the prediction locked in
beforehand. The countdown in the header follows Barcelona by default and can be
pointed at any club with fixtures in the database.

The streaming section is password-gated behind `LIVE_ACCESS_PASSWORD` and
aggregates several third-party providers.

---

## What it does not do

**No team news.** Injuries, suspensions, rotation and managerial changes are not
in the data, so they are not in the odds. A side missing its best striker is
rated as though it is not.

**No duel win rates.** The attempt columns needed come back empty from the feed,
so anything duel-related is a count rather than a success rate. Flagged on the
page rather than quietly presented as something it is not.

**Thin goalkeeping.** Saves, claims and sweeper actions are not in the ingested
stat set, so the keeper board shows distribution and minutes instead of
inventing a shot-stopping rating.

**A simulation is one run, not a distribution.** The simulator plays a season,
not ten thousand of them. Re-run it and you get a different one. Treat a single
run as a story rather than a forecast.

**Not betting advice.** The model is published with its own scorecard precisely
so you can see how often it is wrong. It closes about a tenth of the distance
between guessing and certainty — a real edge over a coin flip, and nowhere near
knowing what will happen.

---

## Project layout

```
app/                  routes (App Router)
  predictions/        model output, accuracy tracker, calibration
  squad/              Barça squad, fixtures, leaders, season simulator
  teams/  signals/  compare/  player/  live/
  api/                route handlers
components/           client components and shared UI
lib/
  learn.ts            model parameters, walk-forward scoring, the fitter
  fitted-model.ts     cached fit, out-of-sample comparison
  predictions.ts      match ratings, Champions League model
  simulate.ts         season simulator and bracket draw
  justice.ts          expected points, table race
  dna.ts              player fingerprints, archetypes, similarity
  barca.ts            scarf, played-like-us, title race
data_loader.py        the Sofascore scraper
refresh.py            scheduled fetch, rebuild, commit, push
sync_db.py            push processed CSVs to Supabase
```

`DESIGN.md` documents the design tokens and visual system.

---

## Tests

Plain Node self-checks, no framework. Each is runnable on its own:

```bash
node lib/learn.test.ts
for f in lib/*.test.ts; do node "$f"; done
```

They cover the model maths and the places where a silent regression would be
expensive: that the fitted defaults reproduce the hand-set model exactly, that
the walk-forward never sees the future, that the bracket draw matches UEFA's
seeding rules, and that a prediction locks at kickoff and not before.

---

## License

[MIT](LICENSE).

Statistics are scraped from Sofascore and are not covered by this licence; the
licence applies to the code in this repository.
