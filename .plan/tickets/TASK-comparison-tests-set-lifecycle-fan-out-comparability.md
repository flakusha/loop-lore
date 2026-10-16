<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Comparison test suite — set lifecycle, fan-out partial failure, comparability

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** `epic-technical-comparison-charts`
**Related:** `TASK-comparison-set-variant-data-model.md`, `TASK-comparison-set-routes-crud-ownership-validation.md`, `TASK-comparison-fan-out-engine.md`, `TASK-comparison-comparability-validation.md`
**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

The end-to-end test suite that holds the epic's three load-bearing promises: a set's lifecycle is
correct, a partial backend failure never sinks a set, and a non-comparable pair is always reported as
such.

## Context

The per-ticket unit tests already cover the pieces (`src/routes/comparison-sets.test.ts`,
`src/comparisons/fan-out.test.ts`, `src/comparisons/comparability.test.ts`,
`src/comparisons/rerun.test.ts`, `src/comparisons/metrics.test.ts`,
`src/comparisons/export.test.ts`, `src/routes/views/comparisons.test.ts`). This ticket is the
cross-cutting suite that exercises them together — it exists because the three properties are
*emergent* across layers and each unit test can pass while the property is broken.

Follow the repo's real test idiom, not an invented one:

- Route tests build an app and call `app.handle(new Request(...))` — see
  `src/routes/views/plugin-dynamic.test.ts:103` for the htmx-header form and `makeApp(db, ...)`.
- DB tests use `setTestDatabase` / the helpers behind `src/db/migrations.test.ts`; per-test temp dirs
  via `mkdtempSync` as in `src/assets/service/persist-generated.test.ts:26`.
- Global-state leak protection: `describeReal` / `describeOrSkip` + the ISOLATED guard are the convention
  where a module needs the real DB — see the note at `src/generation/image-gen-route.test.ts:108`
  about stubs leaking across files. Follow it rather than inventing a new isolation mechanism.
- Provider fakes must be injected at the engine boundary, not by monkey-patching `fetch`.

The three properties to pin:

1. **Lifecycle** — create → variants → fan out → read → patch → re-run → delete. Deleting a set
   leaves its assets intact (assets are shared by `content_hash`; a comparison set owns links, not
   bytes).
2. **Fan-out partial failure** — one backend down, the other up: surviving variants `done`, set
   `completed_with_errors`, no orphan `queued`/`running`.
3. **Comparability** — a mismatch on any of the four rules is reported, and non-comparable points are
   excluded from aggregates.

Real-server coverage: `TASK-sd-e2e-real-server-fixtures-via-sd-cpp-and-comfyui-with-gene.md` is the
first real multi-provider fixture source. This ticket adds a comparison-shaped case on top of those
fixtures only if that ticket has landed; it does not duplicate its server plumbing.

## Acceptance Criteria

- [ ] `src/comparisons/lifecycle.test.ts` walks create → variants → fan out → read → patch → re-run → delete against a real test DB
- [ ] Deleting a set leaves its assets and their `asset_links` rows to other entities intact (a set owns links, not bytes)
- [ ] A fan-out test with one backend down and one up asserts `done` on the survivors, `completed_with_errors` on the set, and zero variants left `queued`/`running`
- [ ] A comparability test asserts each of the four rules is reported and that non-comparable points are excluded from an aggregate
- [ ] A re-run of a fully pinned set reproduces identical variant parameters; a set with any unpinned seed reports `reproducible: false`
- [ ] Provider fakes are injected at the engine boundary; no test monkey-patches global `fetch`
- [ ] DB-touching tests use the repo's existing isolation helpers (`setTestDatabase`, per-test temp dirs, `describeReal`/`describeOrSkip`) rather than a new mechanism
- [ ] `bun test src/comparisons/ src/routes/comparison-sets.test.ts src/routes/views/comparisons.test.ts` green
