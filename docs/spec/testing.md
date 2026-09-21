<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

> High-level notes — may drift from implementation. Authoritative source is `src/` and AGENTS.md.

# Testing Strategy

Bun test runner (Jest-compatible `expect`, `bun:test` mocks), colocated tests `src/feature/feature.test.ts` plus `tests/e2e/`. Roughly a quarter of `src/` files have tests.

Commands: `bun run check` (full gate suite, heavy gates serialized after light ones), `bun run test:unit`, `bun run test:coverage` (unit + e2e, lcov), `bun run test:e2e:browser`.

Finalize path (`giwt finalize <branch>`): 1) `bun run check --diff-base <merge-base>` — gates scoped to the branch diff, enforcing the per-module line-coverage floor (80%); 2) `bun run test:unit` — behavioral, no coverage instrumentation. `test:e2e`/`test:e2e:browser` are CI-only jobs (`.github/workflows/ci.yml`). Selective bypass: `--skip-gates '<names>'`; `CHECK_INCLUDE_HEAVY_DB_TESTS=1` enables the full migration test suite. Lightweight presets: `check:fast` (~15 s, skips coverage/plan-validate/format/md-lint/knip), `check:default` (~30 s), `check` (~72 s). Authoritative skip-list: `DEFAULT_TEST_SKIP_PATTERNS` in `scripts/check-parallel.mjs`.

## Coverage goals & known gaps (directional, not pinned metrics)

- Targets: core logic ≥90%, config/validation ≥80%, edge cases ≥70%, integration ≥60%.
- Well-covered: age-gate, steganography, config, content, crypto, db, generation core, logger, middleware, http-utils, story/game-master, transport, utils.
- Pure-logic quick wins without tests: `src/utils/{get-type,safe-json}.ts`, `src/profanity/service.ts`, `src/db/state.ts`, `src/middleware/{admin-gate,rate-limit}.ts`, `src/transport/{errors,compression}.ts`, `src/story/quality-evaluator.ts` (505 L), `src/story/turn-strategies.ts`, story events extraction, `src/assistant/service.ts`, `src/content/hash-injection.ts`, `src/routes/router.ts`, `src/plugins/registry.ts`, `src/config/constants.ts`.
- Needs DB/provider mocks: cancellation actions/tracker, image-gen + generation routes, assets/personas services+controllers, turn-manager, quest-engine, world-state, story events, `src/middleware/auth/`.
- Hard to unit test (frontend WebCrypto/CompressionStreams, TUI, bootstrap) → covered by browser E2E smoke tests.

## E2E suite

- ~20 flow files with isolated `TestServer` + `ApiClient`; 7 browser files (Playwright); mock LLM/image providers with `failOnCall`/`streamError`; deterministic UUID seeds.
- Known critical gaps: no cross-tenant isolation tests, error envelope never asserted, no cancel-during-generation, no idempotency verification, browser auth/chat flows untested, no pagination tests, no RPG coverage, no message tree/variant tests.
- Structural issues: browser E2E solo-user ID mismatch (server auto-creates random solo user vs seeded IDs) and shared `cachedSoloUser` singleton causing parallel-suite instability — fix: seed solo user / per-request session.

## Schema validation

API responses validated against Elysia TypeBox (`t`) schemas in `src/validation/`. **Zod caveat:** a `src/schemas/` Zod layer does not exist; the Zod/OpenAPI/Schemathesis contract-testing pipeline is aspirational (`docs/meta/code-practices-improvements/06-schemas-and-openapi.md`). OpenAPI is served at `/api/docs` via `elysia-swagger`.

## Epics

- `.plan/epics/epic-core-testing-frameworks.md`
- `.plan/epics/epic-testing-qa.md`
- `.plan/epics/epic-e2e-integration-testing.md`
