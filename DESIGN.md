---
name: Wilderweb Kingdom Tracker
description: A frontier ledger for tracking a D&D kingdom-building campaign's state and history
colors:
  bg: "#0f0d0a"
  bg-elevated: "#171310"
  bg-card: "#1c1712"
  bg-card-hover: "#221b15"
  bg-inset: "#131009"
  border: "#362c20"
  border-soft: "#291f16"
  border-strong: "#5a4426"
  parchment: "#ecdfc0"
  parchment-dim: "#d8c9a3"
  ink: "#241c12"
  text: "#ece3d3"
  text-dim: "#a99a83"
  text-faint: "#918575"
  accent: "#b8823c"
  accent-strong: "#dda75a"
  accent-soft: "rgba(184, 130, 60, 0.14)"
  accent-line: "rgba(221, 167, 90, 0.35)"
  good: "#7fae6c"
  good-soft: "rgba(127, 174, 108, 0.16)"
  bad: "#c66a52"
  bad-soft: "rgba(198, 106, 82, 0.16)"
  warn: "#d0a23a"
  warn-soft: "rgba(208, 162, 58, 0.16)"
  season-spring: "#7fae6c"
  season-summer: "#d0a23a"
  season-autumn: "#c17a3f"
  season-winter: "#7fa0b0"
typography:
  display:
    fontFamily: "Fraunces, 'Iowan Old Style', Georgia, serif"
    fontWeight: 600
    letterSpacing: "0.01em"
  body:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  sm: "8px"
  md: "12px"
  pill: "999px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "#1c1409"
    rounded: "{rounded.sm}"
    padding: "0.45rem 0.9rem"
  button-primary-hover:
    backgroundColor: "{colors.accent-strong}"
    textColor: "#1c1409"
  button-secondary:
    backgroundColor: "{colors.bg-elevated}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: "0.45rem 0.9rem"
  card:
    backgroundColor: "{colors.bg-card}"
    rounded: "{rounded.md}"
    padding: "1.1rem 1.3rem"
  pill:
    backgroundColor: "{colors.bg-elevated}"
    textColor: "{colors.text-dim}"
    rounded: "{rounded.pill}"
---

# Design System: Wilderweb Kingdom Tracker

## Overview

**Creative North Star: "The Frontier Ledger"**

Wilderweb reads as a settler's account-book kept by firelight: ink on parchment, warm bronze
fittings, a dark leather-bound cover. It is not a SaaS dashboard wearing dark mode as a theme
toggle -- the palette, type, and card language are built around the idea of a physical object a
DM keeps at the table, not a generic B2B admin panel. Every screen is a page in that ledger:
resource totals sit like an accountant's tally, the timeline reads like a chronicle with a
hand-drawn thread down its spine, and the calendar looks like a page torn from an actual
almanac.

The system stays warm, lived-in, and tactile rather than glossy or corporate. Density is
moderate -- this is a working tool used mid-session, not a marketing page -- so legibility and
scanability come before ornamentation, but the ornamentation that exists (the parchment card
variant, the circular brand seal, the season-colored calendar) is load-bearing to the "ledger"
identity, not decoration to strip away.

**Key Characteristics:**
- Dark, warm-neutral base (near-black browns, not cool grays) with a single restrained bronze
  accent
- Serif display type (Fraunces) for anything that reads as a heading or a recorded value;
  humanist sans (Inter) for everything functional
- Flat-at-rest surfaces; shadow and glow appear only as state feedback (hover, current, focus)
- Pill-shaped badges and fully rounded meters against otherwise moderately-rounded (8-12px)
  rectangular surfaces
- A dedicated "parchment" surface (light, ink-on-cream) reserved for read-as-lore content
  (the Codex introduction), distinct from the app's dark working surfaces

## Colors

A near-black warm-brown base carries the whole app; a single bronze accent is spent sparingly on
things that are actionable or currently true, and semantic greens/reds/ambers carry meaning
everywhere else.

### Primary
- **Weathered Bronze** (`#b8823c`) / **Weathered Bronze, bright** (`#dda75a`): the only accent
  color. Used on primary buttons, the active sidebar item, active book-tab underline, focus
  rings, the brand seal, and stat values rendered in the display font. Its rarity is the point --
  see the Named Rule below.

### Neutral
- **Ledger Black** (`#0f0d0a`): the page background, plus a very faint repeating diagonal
  hairline texture and two soft radial glows (bronze upper-left, sage upper-right) -- the
  "firelight" the rest of the palette reads against.
- **Raised Panel** (`#171310`): the sidebar gradient top and the sticky status bar -- one step
  up from the page.
- **Card Surface** (`#1c1712`) / **Card Surface, hover** (`#221b15`): the default surface for
  every `.card` (stat groups, settlement cards, deity cards, timeline entries).
- **Inset Well** (`#131009`): recessed surfaces -- text inputs, the meter track, empty states.
- **Parchment** (`#ecdfc0`) / **Parchment, dim** (`#d8c9a3`): not a background neutral in the
  usual sense -- reserved for (a) heading/stat-value text color on the dark surfaces, and (b) the
  full background of the `.card.parchment` variant used for the Codex's read-as-lore content,
  where **Ink** (`#241c12`) becomes the text color instead of the light palette above.
- **Parchment Ink Text** (`#ece3d3` / dim `#a99a83` / faint `#918575`): the three-step body-text
  scale on dark surfaces, from primary reading text down to faint captions/eyebrows.
- **Border, Soft, Strong** (`#362c20` / `#291f16` / `#5a4426`): hairline dividers, card borders,
  and (strong) hover/current-state borders, in ascending weight.

### Semantic
- **Good** (`#7fae6c`): positive deltas, confirmed/satisfied states, the "good" meter fill.
- **Bad** (`#c66a52`): negative deltas, danger actions, error text.
- **Warn** (`#d0a23a`): validation warnings (the non-blocking kind, ADR-0005) and the warning-list
  panel.
- **Seasons** (spring `#7fae6c`, summer `#d0a23a`, autumn `#c17a3f`, winter `#7fa0b0`): the
  calendar's only decorative color family, reused as CSS custom properties (`--season-color`) to
  tint a month card's top border, the "current" glow, and holiday markers -- spring and summer
  intentionally reuse the Good/Warn hues rather than adding two more colors to the palette.

### Named Rules
**The Rarity Rule.** Weathered Bronze appears only on the one actionable or currently-true thing
in a given area (a primary button, the active nav item, the current day) -- never as a background
wash or a decorative flourish. Its scarcity is what makes it read as gold leaf rather than paint.

**The Parchment-Is-Not-a-Neutral Rule.** Parchment and Ink only ever appear together, as a pair,
marking content that is being *read* (lore, an in-fiction introduction) rather than *operated*
(stats, forms, buttons). Never use Parchment as a text color on a dark card, or Ink as a text
color anywhere but inside a `.card.parchment`.

## Typography

**Display Font:** Fraunces (with Iowan Old Style, Georgia fallback)
**Body Font:** Inter (with system sans fallback)

**Character:** A warm literary serif for anything that has been "recorded" -- headings, stat
values, a deity's name -- paired with a plain, highly legible humanist sans for every UI
mechanism (labels, inputs, buttons, body copy). The pairing reads as a printed ledger's mix of
copperplate headings and workaday tabular entries, not a single decorative typeface stretched
over the whole app.

### Hierarchy
- **Headings** (Fraunces, 600, `h1`-`h4` cascade down from ~1.9rem for a page `h2`): section and
  page titles; always Parchment-colored on dark surfaces.
- **Stat Value** (Fraunces, 600, 1.05rem): the one place a *number* takes the display font --
  resource totals on the Dashboard, matching the intent of a hand-inked ledger entry rather than
  a dashboard metric.
- **Body** (Inter, 400, ~0.9rem base, line-height 1.5): all reading text, notes, descriptions.
- **Eyebrow / Label** (Inter, 600, 0.72rem, `letter-spacing: 0.12em`, uppercase): section
  eyebrows and status-bar captions -- the smallest, most functional layer of type in the system.

### Named Rules
**The One Serif Rule.** Fraunces is reserved for headings and recorded values. Every interactive
control -- buttons, inputs, nav, pills -- stays in Inter, so the serif keeps its weight as "this
is a fact being recorded," not decoration.

## Layout

A fixed 248px left sidebar (brand seal, nav list, footer note) plus a content column offset by
the same 248px, capped at a 1180px `max-width` main content area with `2.2rem 2.5rem` outer
padding. A sticky status bar sits between the sidebar's top and the content, showing the current
in-game date/season and the latest logged entry.

Card grids use CSS Grid auto-fit rather than fixed column counts: `.grid-3` (`minmax(230px, 1fr)`)
for dense stat/lore cards, `.grid-2` (`minmax(340px, 1fr)`) for heavier settlement/kingdom cards.
Spacing is rem-based throughout rather than a named token scale, generally stepping through
~0.3rem / 0.5rem / 0.75rem / 1rem / 1.25rem / 1.75rem / 2.5rem as a surface's importance grows.

At `900px` and below, the sidebar collapses from a fixed vertical column into a static horizontal
bar (nav labels hide, only icons remain), and the content column's left margin drops to 0 --
there is no intermediate tablet layout, it's a single breakpoint.

## Elevation & Depth

Mostly flat. Surfaces sit at rest with a hairline border and, at most, a very subtle
`box-shadow: 0 1px 2px rgba(0,0,0,.35)` (`--shadow-sm`) -- not enough to read as "lifted," more a
soft edge. Depth is used deliberately as *state feedback* rather than a static hierarchy signal:
an interactive card gains a stronger border and `--shadow-md` on hover; the calendar's "today"
cell and current month card get a colored glow (`box-shadow` ring in the season color) that
pulses via a slow `pulse-today` keyframe animation. `--shadow-lg` is defined in the token scale
but not currently used anywhere -- reserved headroom, not a signal to start adding heavier drop
shadows.

### Shadow Vocabulary
- **Resting** (`0 1px 2px rgba(0,0,0,0.35)`): the default card shadow -- present but nearly
  invisible, an edge more than a lift.
- **Hover / Interactive** (`0 6px 20px -6px rgba(0,0,0,0.55)`): an `.interactive` card's hover
  state, and the "current" month card's static elevation.
- **Reserved** (`0 16px 40px -12px rgba(0,0,0,0.65)`): defined, unused today.

### Named Rules
**The Glow-Not-Lift Rule.** When something needs to stand out because of *state* (hover, current,
focus), prefer a colored ring/glow over a heavier neutral shadow. A neutral shadow says "this
surface is physically higher"; a colored glow says "this is the one that matters right now" --
the calendar's "today" cell and a focused input both use this, never a generic elevation bump.

## Shapes

Two radius steps carry the whole system: **12px** for cards, empty-states, and the calendar's
day-grid container; **8px** for buttons, inputs, and icon badges. Anything that represents a
count, status, or category (pills, tags, season tags, the progress meter track/fill) is fully
rounded (`999px`) instead. The one circular shape reserved outright is the brand seal in the
sidebar -- a radial-gradient bronze disc, the app's one true "icon," not reused elsewhere.

## Components

### Buttons
- **Shape:** 8px radius (`--radius-sm`), consistent with inputs and icon badges.
- **Default:** `--bg-elevated` background, hairline border, `--text` label -- effectively a
  secondary/ghost button; there is no unstyled default.
- **Primary:** a top-to-bottom bronze gradient (`--accent-strong` to `--accent`) with near-black
  (`#1c1409`) text -- the one button style that reads as "the accent color," per the Rarity Rule.
- **Danger:** default button shape, `--bad` text/border on hover -- restrained, not a solid red
  fill.
- **Hover / Focus:** border shifts to `--accent`, text tints to `--accent-strong`; primary
  buttons brighten via `filter: brightness(1.08)` rather than changing the gradient stops.
- **Active:** a 1px `translateY` press, no scale change.
- **Icon buttons:** square, 2rem, centered icon, no label -- used for row-level edit/remove
  actions (Settlements' building rows).

### Pills / Tags
- **Style:** `--bg-elevated` background, hairline border, fully rounded, small (0.74rem) text --
  the default "neutral fact" pill (event type, settlement name, building count).
- **State variants:** `.accent` / `.good` / `.bad` / `.warn` recolor background+border+text as a
  matched soft/solid pair (e.g. `--good-soft` background with `--good` text) rather than a single
  solid fill -- keeps them legible against the dark base without turning into alert banners.
- **Season tags:** the same pill shape driven by a `--season-color` custom property per instance,
  so the component stays generic while the calendar supplies the color.

### Cards / Containers
- **Corner Style:** 12px (`--radius`).
- **Background:** `--bg-card` by default; the `.parchment` variant swaps to the light
  parchment-to-parchment-dim gradient with `--ink` text (see the Parchment-Is-Not-a-Neutral
  Rule) -- used specifically for the Codex introduction's "posted" content.
- **Shadow Strategy:** see Elevation & Depth -- resting shadow only, hover glow on
  `.interactive`.
- **Border:** 1px `--border`, brightening to `--border-strong` on interactive hover.
- **Internal Padding:** `1.1rem 1.3rem`.

### Inputs / Fields
- **Style:** `--bg-inset` (recessed) background, 1px `--border`, 8px radius, `0.45rem 0.65rem`
  padding.
- **Focus:** border shifts to `--accent` plus a soft 3px accent-tinted ring
  (`box-shadow: 0 0 0 3px var(--accent-soft)`) -- no browser default outline.
- **Numeric inputs** use `font-variant-numeric: tabular-nums` so stat/date columns stay aligned.

### Navigation
- **Sidebar:** icon + label nav items, transparent at rest, `--bg-card` on hover, a soft
  accent-tinted fill with an accent-line border for the active route (per the Rarity Rule, this
  is one of the only places the accent appears as a background wash, and it's deliberately soft,
  not solid).
- **Book tabs** (Codex): an underline-tab pattern instead of the sidebar's filled-pill pattern --
  transparent background always, `--text-dim` at rest, `--accent-strong` text with a solid
  `--accent` underline when active. Used specifically for switching between the Codex's three
  sub-views, distinct from primary page navigation.
- **Mobile (≤900px):** sidebar becomes a horizontal icon-only bar; labels hidden, not
  wrapped or truncated.

### Timeline (signature component)
A vertical thread (`linear-gradient` from `--border-strong` to `--border-soft`, 1px wide) runs
behind a column of entry cards, with a small circular marker (accent-bordered, background-colored
so it "punches through" the thread) at each entry -- the chronicle/ledger-spine reading of a plain
activity feed. Distinct from a generic timeline component in that the marker deliberately reads
as a rivet or a wax-seal dot, not a generic bullet.

### Calendar Month Card (signature component)
A `.card` variant with its top border and (when current) a full glow ring recolored per
`--season-color`; a 6x5 day grid where each cell is a small rounded square, holidays get a
season-neutral accent tint plus a small dot marker, and "today" gets a solid season-colored fill
with a slow pulsing glow (`pulse-today`, 2.4s) -- the one animated, attention-holding element in
an otherwise calm system, reserved for exactly one cell at a time.

## Do's and Don'ts

### Do:
- **Do** keep Weathered Bronze rare -- one primary action or active state per view, never a
  background wash outside the sidebar's active-nav treatment.
- **Do** pair Parchment/Ink only with each other, and only for content being read rather than
  operated (see the Parchment-Is-Not-a-Neutral Rule).
- **Do** use a colored glow (not a heavier neutral shadow) when something needs to stand out
  because of state, not hierarchy.
- **Do** keep Fraunces to headings and recorded values; every interactive control stays in Inter.
- **Do** use the soft/solid pill pairing (`--good-soft` bg + `--good` text, etc.) for any new
  status/semantic tag, rather than a solid fill.

### Don't:
- **Don't** introduce a second accent color -- semantic colors (good/bad/warn) and season colors
  already cover meaning; Weathered Bronze stays the only "brand" color.
- **Don't** add heavy drop shadows or a glassy/blurred-panel look -- the system is flat by
  default; `--shadow-lg` exists but is intentionally unused.
- **Don't** use gray text on a colored background, or pure black/white anywhere -- every neutral
  in this system is warm-tinted (see the Colors token values), not desaturated gray.
- **Don't** put the parchment card treatment on anything operational (a form, a stat panel) --
  it's reserved for lore/read-only content.
