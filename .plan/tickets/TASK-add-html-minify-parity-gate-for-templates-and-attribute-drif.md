<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Add HTML minify-parity gate for templates and attribute drift

**Status:** Done
**Priority:** low
**Effort:** Medium
**Epic:** epic-code-quality.md
**Tags:** frontend, build, html, minify, gates
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Add a blocking build/check gate that minifies every tracked HTML template with the production option set and fails on parse errors or attribute-count drift.

**Evidence (file:line)**

- `src/content/minify.ts:8-20` is the single production option set (`minifyHTMLContent()` at `:54-56`). It is used by the build stage (`src/build/compress.ts:150-167`), the runtime response path (`src/middleware/dynamic-response.ts:89-119` -> `minifyBody` `:130-157` -> `runMinifier` `:164-178`) and the asset copy path (`src/content/compress.ts:95`).
- Gate blind spot, from `scripts/check/parallel/gate-table.mjs`: `frontend - template preflight` (`:209`; `scripts/check-frontend-templates.ts:23-35`) renders every physical view via `loadView` but NEVER minifies; `frontend - innerHTML xss` (`:211`; `scripts/check-frontend-innerhtml-xss.ts:8-15`) scans TS template literals and never reads `.html`; `fe-be - harmony` (`:127`; `scripts/fe-be-harmonization/fe-calls.ts:13-31`) is attribute-blind. Only `e2e - browser (baseline)` (`:215`) would notice a stripped selector; `e2e - browser (qa subset)` (`:222`) is advisory (`:279`).
- Historical failure mode: `stripTestIds()` ran INSIDE the minifier's `try` (`src/build/compress.ts:153-155`, removed by `5d815d825`), so 9 nested-quote mustache templates silently threw, skipped the strip and shipped full-size with testids in `dist/public`.
- Current baseline after `8c8cd7a8f`: 194/194 tracked templates parse (throwaway probe result `total: 194, ok: 194, failures: []`; see `.tmp/html-strip-fix-ledger.md` §2).

**Why deferred (low priority)**
All 194 templates now parse and the harmful build-time strip is gone; this gate is preventive, not a live fix. It needs a new check script plus a gate-table entry and test, so it was skipped out of the two fixes that landed (`5d815d825`, `8c8cd7a8f`).

**Acceptance criteria**

- [x] A check enumerates every tracked `*.html` under `src/views`, `src/components`, `src/partials` (including `src/views/partials`) and minifies each with the production options imported from `src/content/minify.ts`.
- [x] The check exits non-zero with the offending file:line on any parse error.
- [x] The check exits non-zero on attribute-count drift (before vs after minify) for `data-testid`, `x-*`, `@*`, `:*`, `hx-*`.
- [x] Registered in `scripts/check/parallel/gate-table.mjs` as a blocking gate (NOT in `ADVISORY_GATES`).
- [x] A controlled regression (one injected nested-quote directive and one injected attribute-stripping option) makes the gate fail.

**Verification command for the implementer**
`bun run scripts/check-frontend-templates.ts` and `bun run check:parallel --diff-base <base>`. Baseline to preserve: 194/194 parse.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated
**Resolved:** 2026-11-18T10:14:23.035Z Implemented on dev: a0057c6aa743b7c39c2604faf153588738e8a5ba (parity gate, minifier notes, runtime policy test, i18n fix) and f6d78d2bb64b07c5d7b36353380a25f1a9c2016e (bun-plugin-html removal).
