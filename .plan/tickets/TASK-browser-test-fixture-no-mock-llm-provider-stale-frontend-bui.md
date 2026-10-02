<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Browser test fixture does not register a mock LLM provider — causes real network calls or stale-frontend failures

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Epic:** epic-testing-qa
**Summary:** `tests/e2e/flows/browser/mock-llm-provider.ts` provides `registerProvider` wiring for browser tests to use a mock LLM instead of hitting real API endpoints. `tests/e2e/flows/browser/mock-llm-provider.test.ts` verifies the helper shape. However, the fixture file is not imported by the main browser test entry points (`tests/e2e/flows/browser/*.ts`), so browser tests that trigger generation still call real LLM endpoints. Additionally, the frontend rebuild is not triggered before browser tests, so stale JS is tested.
**Context:** Found 2026-08-25 review. The backlog entry names "stale frontend build" explicitly. `mock-llm-provider.ts` exists and is wired correctly, but it is not included in the test fixture bootstrap.
**Acceptance Criteria:** See ## Acceptance Criteria below.
**Git Issue:** 30d0e69

## What

- `tests/e2e/flows/browser/mock-llm-provider.ts` calls `registerProvider(MOCK_PROVIDER_NAME, mock,)` and configures the default provider/model to point to the mock.
- `tests/e2e/flows/browser/mock-llm-provider.test.ts` is a unit test for the fixture itself.
- The fixture is NOT imported by the main browser test suite, so generation-triggering tests (chat flow, character flow) hit real providers.
- The stale frontend build issue: `tests/e2e/` uses Playwright's `page.goto` against a running dev server. If the frontend was not rebuilt since the last source change, the browser runs against stale JS.

## Why

Real LLM calls in CI browser tests: (a) add network latency and flakiness, (b) consume API quota, (c) may return unexpected responses that cause browser tests to fail for non-bug reasons. Stale frontend builds cause tests to pass against old behavior, masking regressions.

## Scope

- Import `mock-llm-provider.ts` (or its `registerProvider` call) into the browser test suite bootstrap, before any test that triggers generation.
- Verify that generation-triggering browser tests (chat-flow, character-flow) do not make real LLM API calls after the fixture is loaded.
- Add a step in the browser test CI script to build the frontend before running (`bun run build` or equivalent), or document that tests must be run against a live dev server with HMR.

## Acceptance Criteria

- [ ] Browser tests that trigger generation use the mock provider (no real LLM API calls in test run)
- [ ] CI script builds frontend before running browser tests, or the test documentation is updated to require HMR
- [ ] `mock-llm-provider.test.ts` verifies the registration succeeds
