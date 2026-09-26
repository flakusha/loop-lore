<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Add focused streaming + HTMX contract browser tests

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

The FE↔BE harmonizer (`scripts/check-fe-be-harmonization.ts:105-176`) verifies literal `fetch`/`apiFetch` calls and `hx-*` attribute paths but does not test response-shape compatibility, swap-target validity, Alpine registration, store-property validity, or custom-event producer/consumer pairs. Add focused browser contract tests for known integration boundaries rather than a generic contract-test framework.

## Where

- tests/e2e/flows/browser/ (add 3 new `*.browser.ts` files)
- tests/e2e/helpers/{browser-server,htmx-alpine,mock-llm}.ts (reuse)

## Acceptance Criteria

- [ ] Streaming UI test: incremental rendering observed, cancel works, idle UI stable, no page errors.
- [ ] HTMX success test: representative form submits; target replaced; expected Alpine init + event behavior fires.
- [ ] HTMX error test: same form into controlled 4xx; visible error behavior; stable UI.
- [ ] All three tests use `createBrowserTest()`, `trackPageErrors()`, `waitForAlpineReady()`, `MockLLMProvider` — no new framework.
- [ ] Each test fails on a plausible frontend/backend mismatch, not on source-text or mock echo.
