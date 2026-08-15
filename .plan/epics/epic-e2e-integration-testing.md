# EPIC: E2E & Integration Testing Reliability

**Status:** 🟡 Draft — analysis complete, tickets scoped
**Priority:** High
**Effort:** Medium
**Type:** Infrastructure Epic
**Tags:** testing, e2e, browser, integration, mocking, dead-code, wiring, reliability
**Proposed Epic Branch:** `epic-e2e-integration-testing`

## Summary

Focused initiative to make loop-lore's test suite give **reliable confirmation of
wiring and features**. Three pillars:

1. **Headless browser tests + scenario coverage** — harden the existing Playwright
   browser suite (web-first polling, console/page-error assertion everywhere,
   per-test isolation, Alpine component-state harness) and codify a canonical
   feature→scenario→test matrix so every feature pillar has a browser test.
2. **Automated unwired/dead-code detection on `bun check`** — a wiring gate that
   verifies routes are mounted, plugins are registered+loaded, and services are
   imported, closing the gap knip leaves (its `exports`/`types` analysis is
   disabled and it has no notion of "wired").
3. **LLM / SD / AI-generation mocking (imitation)** — a full-surface deterministic
   mock provider (text, tools, thinking, streaming, embeddings) + a fake ComfyUI
   server for SD image-gen, plus cassette record/replay for imitation fidelity.

Deliberately **complements, not duplicates**, the two existing testing epics:
`epic-testing-qa.md` (permanently-ongoing umbrella) and `epic-testing-benchmarking.md`
(performance/load — out of scope here). Browser-reliability tasks already scoped as
_un-started candidates_ in the QA epic are **adopted into this epic** and resolved
here; the QA epic keeps ownership of unit-coverage expansion and dialect-matrix work.

## Problem

Ground truth from the current repo (verified 2026-08-12):

- **Browser suite exists but is not yet a reliable signal.** 19 Playwright tests in
  `tests/e2e/flows/browser/` (register, auth-session, chat-flow/chat-state, worlds,
  gallery, search, settings, navigation, characters, htmx-alpine, smoke). But:
  - Tests run via `bun:test` + raw `chromium.launch()` in
    `tests/e2e/helpers/browser-server.ts`; **`playwright.config.ts` is dead config**
    (documents `@playwright/test` runner, retries, trace, reporter — never read).
  - Hundreds of fixed `page.waitForTimeout(...)` sleeps instead of web-first
    polling → flaky, esp. Alpine `attached` vs `visible` timing.
  - **Newer** tests (register-flow, world-invites, auth-session, access-correctness)
    already use `trackPageErrors`/`assertNoPageErrors` + per-test `try/finally`
    isolation; **older** ones (chat-flow, htmx-alpine.browser) do not → mid-migration.
  - QA epic's live probe (2026-08) showed Alpine hydration failures pass silently:
    `htmx-alpine.browser.ts` 13 pass / 4 fail / 1 error — root cause was **app bugs**
    (template expressions referencing undeclared state vars `showGmPanel`/
    `_moodPanel`/`_searchResults`; `Object.defineProperty called on non-object`) that
    abort Alpine subtree processing. No browser test fails on these.
  - A timed-out test leaves its page open → `newPage()` fails downstream (failure
    cascade) where older tests lack `try/finally`.
- **knip in `bun check` misses wiring.** `check` already runs `dead - code (knip)`,
  but `knip.json` sets `"exclude": ["exports", "types"]` — unused exports/types are
  NOT reported, and knip has no notion of _wired_ (a route file mounted in
  `elysia-app.ts`, a plugin registered+loaded via `src/app/register-plugins.ts`, a
  service with ≥1 importer). "Unwired" regressions recur: `epic-achievements`
  shipped code-complete+tests with **zero importers** ("UNWIRED — routes pending");
  `epic-analytics-observability` carried a stale "unwired" assessment until mounting
  was re-verified by hand.
- **Generation mocking covers text only.** `src/test-utils/mock-provider.ts`
  (`MockLLMProvider`) implements `LLMProvider` for text + streaming with two failure
  flags — no image, tools, thinking, embeddings, error taxonomy, or latency. SD
  image-gen goes through a **separate** `ComfyUIClient` (workflow JSON, poll/WS in
  `src/generation/providers/comfyui.ts`) with no fake at all. So e2e cannot exercise
  assistant tool-call UI, image-gen UI, or SD workflows deterministically (they need
  a real network API today).

Net: "wiring and features work" is not reliably confirmed — unwired code ships, and
browser tests can pass while Alpine hydration is broken.

## Design

### Pillar 1 — Headless browser tests + scenarios

- **Adopt or delete `playwright.config.ts`.** Decide once: either migrate the suite
  to the `@playwright/test` runner (web-first `expect`, fixtures, `trace`, retries,
  `test-results`/`playwright-report` output — config already written for it) or drop
  the dead config and formalize the current `bun:test` + raw-browser path. Prefer the
  `@playwright/test` runner: it gives retries/trace/screenshots the raw path lacks and
  makes the config honest.
- **Web-first everywhere.** Replace fixed sleeps with `expect(locator).toBeVisible()`
  / `waitFor` polling; document Alpine `attached` vs `visible` timing.
- **Console/page-error assertion everywhere.** Promote `trackPageErrors`/
  `assertNoPageErrors` (already in `tests/e2e/helpers/htmx-alpine.ts`) to the default
  harness so every browser test fails on uncaught page errors / `console.error`.
- **Per-test isolation everywhere.** Per-test `try/finally` page close; no shared
  browser state leak on timeout; kill the failure cascade.
- **Alpine component-state harness.** `getAlpineData(el)` / `waitForAlpineState`
  helpers reading `Alpine.$data(el)` / `__x.getUnobservedData()` (verified working in
  probes) to assert **component-local reactive state** — not just DOM presence and
  global `Alpine.store(...)`. This is what catches the undeclared-template-var class
  of hydration bug. Pin `chatState()` shape + defaults + `ui-store` contract.
- **Scenario catalog.** A canonical matrix: feature pillar → scenario → browser test
  → status. Feature pillars: register, auth/session, chat send + state, assistant
  tool-call UI, GM panels + quest log, gallery batch (select/download/delete), world
  - location access, invite/join, api-keys, search, settings, navigation, characters,
    generation (with mocked providers — see Pillar 3). Generate a coverage report
    (every pillar ≥1 browser test, green, non-flaky).

### Pillar 2 — Unwired / dead-code gate on `bun check`

- **`scripts/check-wiring.ts`** (pattern-match `scripts/check-db-schemas.ts` /
  `scripts/check-file-size.ts`), added to `check-parallel.mjs`. Static scans:
  - Every `src/routes/*.ts` route module has a mount call in `src/elysia-app.ts`
    (or a central route-collection module) — flag _unwired routes_.
  - Every `plugins/core/*/plugin.ts` / `plugins/community/*/plugin.ts` is registered
    and loaded via `src/app/register-plugins.ts` (or the loader manifest) — flag
    _registered-but-never-loaded_ / _loaded-but-never-registered_.
  - Every module under `src/services/`, `src/assistant/`, `src/rpg/` etc. has ≥1
    importer reachable from an entry — flag _orphan services_.
  - Report zero-importer exports beyond the entry graph.
- **Tighten knip where safe.** Re-enable `exports` analysis (or a scoped subset) so
  dead exported functions are caught; keep the documented `ignoreDependencies` for
  dynamic/string-resolved deps. Coordinate with the wiring script so false positives
  (plugin/test-helper re-export patterns) stay suppressed via `ignore`, not by
  disabling the analysis.
- **Route-coverage tie-in:** the wiring gate also asserts every route has ≥1 test
  file (unit or integration), closing "route exists + mounted but untested".

### Pillar 3 — LLM / SD / AI-generation mocking (imitation)

- **`MockScenarioProvider`** (superset of `MockLLMProvider` in
  `src/test-utils/mock-provider.ts`), implementing the full `LLMProvider` surface
  (`complete`, `stream`, `healthCheck`, `listModels`, `capabilities`):
  - Scenario-driven canned responses: content, tool calls, thinking blocks,
    embeddings, streaming chunk patterns, `finishReason` variants.
  - Error taxonomy injection: `ProviderError`, timeout, 429, 5xx, mid-stream failure.
  - Optional latency/delay for timing-sensitive paths.
  - Registered via `registerProvider(name, mock)` (existing `src/generation/
    providers/registry.ts`), so `resolveProvider`/`callWithFailover` exercise real
    resolution + circuit-breaker logic with deterministic output.
- **Fake ComfyUI server** for SD/`ComfyUIClient` (`src/generation/providers/
  comfyui.ts`): an in-test HTTP(+WS) server that accepts workflow JSON, reports
  `pending → running → completed` progress, and returns a canned image — so image-gen
  e2e runs without a real ComfyUI. Implemented as a fake bound to the client's
  `baseUrl`, mode-gated to test builds.
- **Cassette record/replay** for imitation fidelity: record real provider HTTP
  responses once (offline/dev), commit as fixtures, replay deterministically in CI.
  VCR-style; never enabled in default CI. Used to lock in exact wire shapes (SSE
  chunk boundaries, tool-call deltas) for regression.

### Scope boundary

- **In:** browser reliability + scenario matrix, wiring/dead-code gate, generation
  mocking + cassette. Route-level integration tests already exist
  (`tests/e2e/flows/*.test.ts` are API-level against an in-memory DB) — this epic
  hardens/extends them, does not build from scratch.
- **Out:** performance/load/fuzz (→ `epic-testing-benchmarking.md`); unit-coverage
  expansion + PG dialect matrix + test factories + runtime coverage floor
  (→ `epic-testing-qa.md`, unchanged); contract tests gated on OpenAPI (→ QA, deferred
  — current stack is Elysia `t`, no OpenAPI spec yet).

## Steps

1. Browser: decide `@playwright/test` runner adoption (or formalize raw path); wire
   web-first polling, console/page-error assertion, per-test isolation across the
   whole browser suite; delete dead config if not adopting.
2. Browser: Alpine component-state harness; migrate htmx-alpine/chat-flow off
   presence+sleeps; pin `chatState()` contract.
3. Browser: scenario catalog + coverage report; add missing pillar tests (tool-call
   UI, GM panels, gallery batch, generation, image-edit, worlds/locations).
4. Gate: `scripts/check-wiring.ts` (routes mounted / plugins loaded / services
   imported) + route-test coverage assertion; wire into `check-parallel.mjs`.
5. Gate: tighten knip (re-enable `exports` analysis, keep documented ignores);
   reconcile false positives via `ignore`.
6. Mock: `MockScenarioProvider` full-surface + fake ComfyUI server; migrate
   `generate-route.test.ts` and e2e generation flows onto it.
7. Mock: cassette record/replay harness; commit first fixtures.
8. Verify: `bun run check` green; browser suite 100% pass, 0 flaky across repeated
   runs; wiring gate catches a deliberately-introduced unwired route.

## Related Epics

- **`epic-testing-qa.md`** — ongoing umbrella; owns unit-coverage expansion +
  dialect matrix + runtime coverage floor + contract (OpenAPI-gated). This epic
  **adopts** its un-started browser candidate tasks: `TASK-alpine-state-testing`,
  `TASK-browser-console-assert`, `TASK-browser-test-isolation`,
  `TASK-resolve-playwright-cfg`, `TASK-chat-state-contract`.
- **`epic-testing-benchmarking.md`** — performance/load/fuzz/security; explicitly out
  of scope here.
- **`epic-code-quality.md`** — the `check` gate runner + knip + custom check scripts
  originate here; the wiring gate extends that surface.
- **`epic-platform-integrations.md`** (EPIC-046) — provider catalog + health/
  discovery; Pillar 3 mocking must stay provider-agnostic so catalog additions get
  mock coverage automatically.
- **`epic-achievements.md` / `epic-analytics-observability.md`** — documented the
  unwired-code failure mode the wiring gate (Pillar 2) prevents.

## Tickets

See "Platform-integrations tickets" pattern — created via `worktree.sh ticket`,
linked to this epic:

- [ ] `TASK-e2e-browser-reliability-hardening` — runner decision, web-first polling,
      console/page-error assertion everywhere, per-test isolation, dead-config cleanup.
- [ ] `TASK-e2e-alpine-state-harness` — `getAlpineData`/`waitForAlpineState`, migrate
      htmx-alpine/chat-flow off presence+sleeps, pin `chatState()` contract.
- [ ] `TASK-e2e-scenario-catalog` — feature→scenario→test matrix + coverage report;
      add missing pillar tests.
- [ ] `TASK-wiring-dead-code-gate` — `check:wiring` + knip `exports` tightening +
      route-test coverage assertion.
- [ ] `TASK-generation-mock-scenario-provider` — full-surface mock + fake ComfyUI server.
- [ ] `TASK-generation-cassette-replay` — record/replay harness + first fixtures.
- [ ] `TASK-BROWSER-E2E-UI-SURFACE-GAPS` — remaining untested UI surfaces (quests,
      personas, notifications, nsfw-moderation, character-edit, world-detail, VN scene,
      battle, chat reactions/pins/sections, group-chat, story, i18n/export/error/responsive)
      + weak-spot hardening. Extends TASK-BROWSER-E2E-COVERAGE-EXPANSION-PLAYWRIGHT-INTEGRATION.
