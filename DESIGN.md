# footyy — design system

A dark, data-first UI. Zero chroma on surfaces so club crests and chart colour do the talking. All tokens live in `app/globals.css`; this file is a map, not a redefinition.

## Core idea

- **Dark by default** (`<html className="dark">` in `app/layout.tsx`). No light theme is wired up for the app — tokens exist in `:root` but the shell forces dark.
- **Colour is reserved for data**, not for chrome. Surfaces are pure greys. The one accent is `--pitch` (green `oklch(0.80 0.19 150)`), used sparingly for primary stat emphasis, the top-rank badge glow, the shimmer sweep, the card-lift beam.
- **Shape vocabulary**: `rounded-2xl` for cards, `rounded-full` for pills and segments, hairline inner-outline for row hover.
- **Light-from-above lighting**: every elevated surface has an inset top-highlight + inset bottom-shadow + an outer drop shadow. The `.surface` and `.surface-raised` utilities bake this in.

## Fonts

Loaded via `next/font/google` in `app/layout.tsx`:

| Role | Family | CSS var | Usage |
|------|--------|---------|-------|
| Body / UI | Archivo | `--font-sans` | Default on `<html>` |
| Headings / stat figures | Oswald | `--font-condensed`, aliased `--font-heading` | Page titles, stat labels, stat figures, rank badges, logotype |
| Mono | Archivo | `--font-mono` | Tabular numbers (same font as body on purpose) |

## Tokens

Source: `app/globals.css`. Both themes defined; dark values are what actually ships.

### Dark palette (ships)

| Token | Value | Role |
|-------|-------|------|
| `--background` | `oklch(0.145 0 0)` | Page bg |
| `--foreground` | `oklch(0.97 0 0)` | Body text |
| `--card` | `oklch(0.205 0 0)` | Elevated surface |
| `--muted-foreground` | `oklch(0.71 0 0)` | Secondary text / stat labels |
| `--border` | `oklch(1 0 0 / 9%)` | Hairlines |
| `--pitch` | `oklch(0.80 0.19 150)` | Primary accent (pitch green). Dark theme only. |
| `--deep` | `oklch(0.105 0 0)` | Vignette foot |
| `--destructive` | `oklch(0.63 0.21 25)` | Error/wrong |

### Chart palette (dark)

Also in `oklch`:
- `--chart-1` green `0.80 0.19 150`
- `--chart-2` blue `0.65 0.185 258`
- `--chart-3` amber `0.80 0.15 75`
- `--chart-4` magenta `0.70 0.17 330`
- `--chart-5` orange `0.72 0.14 40`

### Radius

Base `--radius: 0.75rem`. Tailwind scales derive from it (`--radius-sm` 0.6×, `--radius-md` 0.8×, `--radius-lg` 1×, `--radius-xl` 1.4×, `--radius-2xl` 1.8×, `--radius-3xl` 2.2×, `--radius-4xl` 2.6×). In practice the UI leans on `rounded-2xl` and `rounded-full` almost exclusively.

### Page background

The body sits under a baked-on vignette: a soft radial grey at the top centre and a `--deep` falloff at the foot. Fixed attachment, so the gradient does not scroll with content.

```css
background-image:
  radial-gradient(ellipse 90% 55% at 50% -5%, oklch(0.25 0 0) 0%, transparent 65%),
  linear-gradient(to bottom, transparent 55%, var(--deep) 100%);
background-attachment: fixed;
```

## Surfaces

Two utility classes do most of the lifting. Both are "lit from above" — a top highlight catches light, a bottom hairline grounds the shape, and the shadow pools below.

### `.surface`

Standard card. Pair with `rounded-2xl bg-card`.

```html
<section class="surface rounded-2xl bg-card p-5">…</section>
```

- Top gradient wash: `oklch(1 0 0 / 5%)` → transparent at 38%
- Shadows: inset top highlight, inset bottom shadow, 1px drop, soft 28px bloom

### `.surface-raised`

Slightly brighter top wash and a punchier drop. Used when a card needs to sit visually above a `.surface` grid (e.g. list rows with their own hover state).

### `.segment`

The glass pill group. Backdrop-blur, saturated, dark translucent fill. Used by `MainNav` and `SlidingSegment`.

```css
background: oklch(0.185 0 0 / 72%);
backdrop-filter: blur(14px) saturate(140%);
```

Pair with `rounded-full flex p-1 gap-0.5` to get the standard segmented control shell.

### `.nav-pill`

Same glass treatment, rounded, hover lifts the shadow stack. Used by the floating FOOTYY logo pill in the top-left of the sticky nav.

## Cards — the three archetypes

### 1. Hero / primary data card — `.surface .spark`

A standard `rounded-2xl bg-card` panel with a thin pitch-green beam that sweeps across the top edge every 5s via `::before`. Looks premium at rest, animated on glance. Keep for section headers and summary cards.

```html
<section class="spark surface rounded-2xl bg-card p-5">
  <h2 class="stat-label text-sm mb-4" style="color: var(--pitch)">Win Probability</h2>
  …
</section>
```

### 2. Interactive tile — `.card-lift .surface-raised`

Clickable cards (match cards on `/predictions`, player grid tiles). On hover: translate up 8px, a bright pitch-green beam rotates around the full perimeter (conic-gradient mask over a 1.5px border), shadow deepens. Active press returns to `-1px` quickly.

```html
<Link class="card-lift surface-raised rounded-2xl px-5 py-4 flex items-center gap-4">…</Link>
```

Transition: 260ms `cubic-bezier(0.2, 0.8, 0.2, 1)` for both transform and shadow. Beam spins at 1.6s linear.

### 3. Row item — `.row-item`

List rows that live inside a card. No fill, no shadow — a hairline inner outline appears on hover and the row nudges 1px right. Monochrome, premium feel.

```html
<div class="row-item px-4 py-3">…</div>
```

Transition: 220ms `cubic-bezier(0.2, 0.8, 0.2, 1)`.

## Pills, badges, labels

### `.stat-label`

Oswald, 0.6875rem, uppercase, 0.09em tracking, muted colour. Used for every section micro-label ("WIN PROBABILITY", "GOALS", "XG").

### `.stat-figure`

Oswald, condensed, 600 weight, tabular numerals, tight tracking. Pair with text-size utilities (`text-3xl`, `text-5xl`) for stat values.

### `.rank-badge`

24×24 circular badge, Oswald tabular, 700 weight. Picks medal gradients by `data-rank`:

- `[data-rank="1"]` gold with pitch-tinted glow (`0 0 14px`)
- `[data-rank="2"]` silver
- `[data-rank="3"]` bronze
- Any other rank: neutral white 5% fill, hairline inner highlight

### Pill badges (ad-hoc)

Status pills (e.g. prediction CORRECT/WRONG on `/predictions/match`) use inline style:

```html
<span class="stat-label text-[0.65rem] px-3 py-1 rounded-full"
      style="color: var(--pitch); background: oklch(0.80 0.19 150 / 13%)">
  Prediction CORRECT
</span>
```

Pattern: `stat-label` typography + 13% tinted bg of the accent colour + `rounded-full`.

## Navigation

### Shell (`app/layout.tsx`)

- `nav` is `sticky top-0 z-40 pointer-events-none`.
- A full-width `absolute` gradient under it fades background→background/85→transparent over the top 24px so content can scroll behind the nav without clashing.
- Container is `max-w-6xl mx-auto` with the FOOTYY pill on the left and the segmented controls on the right. Each interactive child re-opts into `pointer-events-auto`.
- Right side holds `SeasonToggle` + `MainNav`, both wrapped in `<Suspense>` (both read `useSearchParams`/`usePathname`, which block Next 16 Cache Components prerender; the fallback has the same shape so there is no layout shift).

### FOOTYY logo pill

- `.nav-pill` glass background, rounded-full.
- 22×22 inline SVG football crest, `stroke="var(--pitch)"`.
- On hover the icon rotates 180° over 500ms (`group-hover:rotate-180`), the pill shadow deepens over 220ms.
- Wordmark: Oswald, 1.4rem, 700, `-0.03em` tracking.

### Main nav — `components/main-nav.tsx`

- `.segment` pill container.
- An absolutely-positioned pill (`bg-white/[0.08]`, inset highlight) slides between items.
- Position + width measured on mount, route change, resize, hover and focus via `useLayoutEffect` + `getBoundingClientRect`.
- Transition: `transform` and `width` over 300ms `cubic-bezier(0.2, 0.8, 0.2, 1)`.
- Each link is wrapped in a `Tooltip` with a 150ms open delay (`TooltipProvider` in root layout) and 8px sideOffset.
- Active link gets `data-active`; styling via `data-[active]:text-foreground`. Muted when inactive, foreground on hover/focus/active.
- SSR fallback (`MainNavFallback`) renders the same markup with no pill — avoids a layout shift and does not need `usePathname`.

### Segmented controls — `components/sliding-segment.tsx`

Reusable version of the nav pattern. Used by `SeasonToggle`, `CompetitionToggle`, `PredictionsLeagueToggle`.

- Same `.segment` glass + sliding pill treatment.
- Items can be `href` (renders `<Link scroll={false}>` with Next prefetch — preferred when the destination is a URL) or `onPick` callback.
- **Optimistic selection**: on click, `optimisticKey` is set immediately so the pill locks onto the chosen item before the router round-trip, preventing a visible snap-back during `router.push → re-render`. Cleared when the real `activeKey` prop catches up.
- Buttons are `aria-pressed`, with `role="group"` on the container and `aria-label` required at the call site.

### Routes

Declared in `main-nav.tsx`:

| Path | Label | Hint |
|------|-------|------|
| `/` | Players | Top scorers & assists |
| `/teams` | Teams | Standings & power rankings |
| `/signals` | Signals | Derived metrics only we track |
| `/predictions` | Predict | Match predictions |
| `/compare` | Compare | Side-by-side player stats |

Active logic: `/` matches exact; everything else matches exact OR as a prefix (so `/predictions/match` keeps "Predict" active).

## Animations

All keyframes defined in `app/globals.css`. All respect `prefers-reduced-motion: reduce` via a global override at the bottom of the stylesheet.

| Name | Duration | Easing | Where |
|------|----------|--------|-------|
| `fade-in` | 500ms | ease-out | Page headers (`animate-fade-in`), hero intros |
| `slide-up` | 500ms | ease-out | New cards appearing, used standalone or via `.stagger` |
| `slide-down` | 200ms | ease-out | Dropdowns, popovers |
| `card-lift-spin` | 1600ms linear infinite | linear | The pitch-green conic-gradient border beam on `.card-lift:hover`. Needs `@property --card-lift-angle` for animatable angle. |
| `stat-pop` | 600ms | `cubic-bezier(0.2, 0.8, 0.2, 1)` | Stat figures mount: scale 0.7 → 1.08 → 1 |
| `shimmer` | 3500ms linear infinite | linear | Leader's figure, gradient-clipped text sweep in pitch green |
| `spark-sweep` | 5000ms linear infinite | linear | A thin pitch beam travels the top edge of any `.spark` card |

### Stagger

Children of `.stagger` animate in with `slide-up`, each delayed by 60ms up to item 10. Use for grids where the slight cascade helps the eye enter the page.

```html
<div class="grid grid-cols-3 gap-3 stagger">
  <Card /> <Card /> <Card /> …
</div>
```

### Micro-interactions

- Hover elevation: `.card-lift` lifts 8px, `.row-item` slides 1px, `.nav-pill` deepens its shadow — all over 220–260ms with the same ease-out curve.
- Press feedback: `.card-lift:active` returns to `-1px` with a snappier 100ms duration.
- Focus states: default outline-ring (muted) via base `outline-ring/50`; segmented controls additionally use `data-[active]` for persistent "selected" styling.

## Numbers (tabular)

Everywhere a number is shown comparatively — stat figures, segment labels, rank badges — use `tabular-nums` (via class or the `.stat-figure` utility, which sets `font-variant-numeric: tabular-nums`). Prevents glyph-width jitter when values animate or change.

## Backdrops (opt-in)

Full-viewport photo backdrops with a baked dark overlay for legibility. Pages opt in by rendering the div.

```html
<div className="yamal-bg" />   // on /player/lamine-yamal, compare pages with Yamal
<div className="pedri-bg" />   // on /player/pedri, compare pages with Pedri
```

Both are `position: fixed; inset: 0; z-index: 0; pointer-events: none;` with a 60–72% black gradient over `/yamal.png` or `/pedri.png`. Priority: Yamal wins when both are selected on `/compare`.

## Theme accents

### `.barca-stripes`

Repeating diagonal Blaugrana stripes (navy → claret, 42px→180px repeat), dimmed by a ~70% dark overlay so content on top stays readable. Opt-in on Barcelona-specific hero sections (`app/predictions/match/page.tsx`).

## When adding something new

1. **Reach for `.surface` + `rounded-2xl` + `bg-card` first.** Nine out of ten cards fit this.
2. **Use `.card-lift` only for things that navigate.** The spinning beam reads as "clickable".
3. **Avoid new colour tokens.** Chart colours exist; `--pitch` is the one accent. If something new needs emphasis, use `--pitch` at 13% alpha for a tinted pill or inline style.
4. **Use the sliding segment, not raw tabs.** Any 2–5 item choice is a `SlidingSegment`.
5. **Numbers get `tabular-nums`.**
6. **Respect `prefers-reduced-motion`.** New keyframe animations go in the `@media` override at the bottom of `globals.css`.
7. **Dark-only.** No light-mode styles ship; don't add `.light:` variants until there is a toggle.
