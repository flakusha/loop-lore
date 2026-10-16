<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Comparison chart export — PNG, SVG, CSV

**Status:** Not Started
**Priority:** low
**Effort:** Small
**Epic:** `epic-technical-comparison-charts`
**Related:** `TASK-comparison-metric-collection-and-charts.md`, `TASK-comparison-grid-frontend.md`, `TASK-vector-gen-svg-serve-safety.md`, `TASK-svg-upload-leads-to-stored-xss.md`
**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

Export any comparison chart as PNG, SVG, or CSV — the SVG path reusing the vector-gen pipeline, and
all three paths honoring the sanitization and serve-header gates that vector output must pass.

## Context

The chart is a DOM `<svg>` element (`TASK-comparison-metric-collection-and-charts.md`), so:

- **SVG** — serialize the element, run it through the sanitizer, download. The sanitizer is owned by
  `epic-vector-graphics-generation.md` and lands at `src/assets/service/sanitize-svg.ts` with
  `TASK-vector-gen-svg-serve-safety.md` (allowlist elements/attrs/CSS/schemes; strip
  script/`on*`/`foreignObject`/external refs).
- **PNG** — rasterize the same `<svg>` client-side; no server round-trip.
- **CSV** — build server-side from `comparison_variant_metrics` + the variant rows so the export is
  reproducible and testable, rather than scraped out of the DOM.

**Gating constraint.** Both SVG security tickets are **Not Started** today:

- `TASK-vector-gen-svg-serve-safety.md` — sanitized-SVG allow path plus hardened serve headers
  (`Content-Security-Policy: sandbox`, `X-Content-Type-Options: nosniff`, attachment disposition for
  unsanitized legacy bytes). Verified 2026-10-16: `src/assets/service/sanitize-svg.ts` does not exist.
- `TASK-svg-upload-leads-to-stored-xss.md` — the underlying stored-XSS class; `image/svg+xml` is blocked
  at persist time by the mime allowlist in `src/assets/service/validate.ts`.

Therefore: **chart SVG export must be a client-side download only** — never a server-persisted asset —
until the sanitizer and serve headers land. A downloaded file the user saves locally does not hit
`validate.ts` and does not create a stored-XSS vector in this app. If the export is ever changed to
persist server-side, it must first be gated behind `TASK-vector-gen-svg-serve-safety.md` landing. Do
not persist chart SVGs through `createAsset` while `validate.ts` blocks `image/svg+xml` — the persist
path would either fail or be routed around the allowlist, and routing around it is exactly the failure
that ticket exists to prevent.

CSV injection: a prompt or model name beginning with `=`, `+`, `-`, or `@` is formula injection when the
CSV is opened in a spreadsheet. Prefix such cells or quote-escape them; a comparison set's cell labels
are user-authored.

## Acceptance Criteria

- [ ] Chart exports as PNG client-side from the existing `<svg>` element with no server round-trip
- [ ] Chart exports as SVG client-side as a **download only**; no exported SVG is persisted through `createAsset` and none is served from an app URL
- [ ] No new runtime dependency is added for rasterization or CSV generation
- [ ] CSV export is produced server-side from `comparison_variant_metrics` + variant rows and round-trips in a test
- [ ] A CSV cell whose value begins with `=`, `+`, `-`, or `@` is escaped so a spreadsheet does not evaluate it
- [ ] The download filename includes the set id and the exported metric/parameter pair
- [ ] `src/comparisons/export.test.ts` covers CSV round-trip, formula-injection escaping, and asserts the SVG path performs no persist call
