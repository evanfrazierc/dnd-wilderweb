---
target: the add-new-entry UX on each page (Dashboard, Calendar, Settlements, Timeline, Codex)
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:C:\\code\\dnd-wilderweb\\client\\src\\components\\add-entry-flows"
timestamp: 2026-09-07T13-18-06Z
slug: client-src-components-add-entry-flows
---
**Method: dual-agent (Assessment A: independent design review · Assessment B: independent detector + browser evidence, both isolated)**

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2/4 | The header's "LATEST ENTRY" badge doesn't update after a save -- confirmed independently by both assessments |
| 2 | Match Between System and Real World | 4/4 | Fully in-fiction vocabulary and a bespoke fictional-calendar date picker, not generic CRUD |
| 3 | User Control and Freedom | 2/4 | Dashboard's dirty stat draft has no Cancel/Discard, unlike Settlements' edit form |
| 4 | Consistency and Standards | 2/4 | Forms are inconsistently dirty-gated vs. always-visible with no stated rule; Discord toggle gating differs by form |
| 5 | Error Prevention | 3/4 | Settlements' catalog-select prevents typos; Timeline's resource-change field doesn't |
| 6 | Recognition Rather Than Recall | 2/4 | Timeline's resource-change field requires typing exact resource names from memory, no autocomplete |
| 7 | Flexibility and Efficiency of Use | 2/4 | No shortcuts, no "repeat last entry"; date auto-fill behavior inconsistent with no visible signal why |
| 8 | Aesthetic and Minimalist Design | 3/4 | Individual forms are lean; Settlements as a whole (9 simultaneous forms) is not |
| 9 | Help Recognize/Diagnose/Recover from Errors | 2/4 | Pre-save errors render raw Error: {message}; post-save warnings are well-designed |
| 10 | Help and Documentation | 1/4 | No onboarding or persistent help affordance (reasonable for a 2-person bespoke tool) |
| **Total** | | **24/40** | **Acceptable -- significant improvements needed** |

## Design Specificity Verdict

LLM assessment (A): Strongly authored, not generic CRUD -- voiced copy, a bespoke fictional-calendar GameDatePicker, season-glow month cards.

Deterministic scan (B): impeccable detect --json client/src ran clean -- zero findings. B verified the tool itself works but flagged that fonts/colors are declared as CSS custom properties consumed via var() everywhere, which the detector's literal-string rules likely can't see through. Zero findings is a probable tool blind spot, not proof of a clean bill.

Visual overlays: No live-server overlay injection was run this pass -- B substituted direct browser interaction, DOM measurement, and network/console inspection instead.

## Overall Impression

Solid bones, let down by exactly the parts that matter most for a DM's trust in an audit-log tool. Both assessments independently caught the same bug: the one persistent, glance-able "yes, that saved" signal in the whole app doesn't reliably update.

## What's Working

1. GameDatePicker as a real domain-specific control (A) -- corroborated by B: renders cleanly at both desktop and mobile widths on all 5 forms, zero overflow, zero console errors.
2. useEventSubmit/PostToDiscordToggle/WarningsList shared hook (A) eliminated copy-pasted save UI -- B independently confirmed the disabled-state and warning-list styling is correctly and consistently implemented everywhere it checked.
3. Settlements' select-vs-custom-name toggle (A) -- a genuinely evidence-driven fix documented by its own code comment.

## Priority Issues

[P1] The app's one persistent confirmation signal goes stale after any save except from Dashboard
- Why it matters: StatusBar.jsx:11-17 fetches the latest event once in a mount-only effect. Both assessments saved a real event from a non-Dashboard page and watched the header keep showing the previous entry.
- Fix: Have the header subscribe to (or refetch on) every successful useEventSubmit call app-wide, not just Dashboard's.
- Suggested command: /impeccable harden

[P1] No button has a focus-visible indicator anywhere in the app
- Why it matters: B verified via getComputedStyle that input/select/textarea get a bronze focus ring (index.css:138-140), but .btn (index.css:259-326) has hover/active/disabled states and no :focus/:focus-visible rule at all.
- Fix: Add .btn:focus-visible { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); } once at the shared .btn rule.
- Suggested command: /impeccable polish

[P1] Timeline's resource-change field is free text with zero validation
- Why it matters: Every other resource-touching surface prevents typos by construction; Timeline's field is parsed by regex with no autocomplete and no feedback -- a misspelled resource name silently mints a phantom resource or drops the change.
- Fix: Reuse the resource list already loaded on Dashboard as autocomplete/chip entry, or warn client-side on an unrecognized key before submit.
- Suggested command: /impeccable harden

[P2] Every GameDatePicker instance fetches its own copy of the same data
- Why it matters: B measured 18 duplicate GETs opening Settlements (9 regions) within ~2 seconds -- the gap flagged but not fixed in the earlier /impeccable audit this session, now quantified as worse than estimated.
- Fix: Hoist the fetch in useCalendarStructure.js behind a shared cache so concurrent pickers share one in-flight request.
- Suggested command: /impeccable optimize

[P2] Inconsistent show/hide pattern across forms, and Settlements shows 9 of them at once
- Why it matters: No documented rule for which forms are dirty-gated vs. always-visible; Settlements compounds this into up to 54 simultaneous live form fields across 9 regions.
- Fix: Pick one rule and apply it -- most likely, collapse each region's add-building form behind a "+ Add building" affordance, expanded on demand.
- Suggested command: /impeccable layout

## Persona Red Flags

Alex (impatient power user): Hunting across a tall page for the right one of 9 near-identical open forms. No "repeat last date/note" shortcut. The 18 duplicate requests on Settlements add real latency exactly when Alex wants to move fast.

Jordan (confused first-timer): On Timeline, no way to tell whether the resource-change syntax is required or an example, no live preview. On Settlements, unclear which of 9 open forms is the action vs. reference data.

## Minor Observations

- Note-field placeholder copy drifts ("What happened" vs. "What happened this tick").
- DESIGN.md claims mobile nav labels hide at <=900px; the shipped bottom tab bar keeps small labels visible -- a doc/implementation drift.
- B's measured 25.6px/32px touch targets at 390px width are not a new regression -- those are already bumped to 44px for real touch input via the existing @media (pointer: coarse) rule; B's mouse-driven test environment correctly doesn't match pointer:coarse.
- Both agents independently ran against the same shared local dev DB/session and each controlled for stray leftover data; doesn't affect any code-level finding above.

## Questions to Consider

1. What if the header's confirmation badge subscribed to any successful save app-wide instead of being wired per-page?
2. What if Timeline's free-text resource entry became the same tag/chip vocabulary Dashboard already uses?
3. Is the missing .btn:focus-visible rule really a five-minute fix, or does clicking through reveal other buttons with hand-rolled styles that would fight a shared rule?
