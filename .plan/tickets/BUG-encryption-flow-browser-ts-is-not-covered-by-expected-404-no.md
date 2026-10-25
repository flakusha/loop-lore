<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: encryption-flow.browser.ts is not covered by EXPECTED_404_NOISE_ALLOWLIST, so the by-design game-state 404 flakes it under load

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Spec: tests/e2e/flows/browser/encryption-flow.browser.ts (the 'e2e - browser' gate).

The harness already exports an endpoint-scoped allowlist for the by-design 404: EXPECTED_404_NOISE_ALLOWLIST in tests/e2e/helpers/htmx-alpine.ts:47-49. It matches the console-error and response-event shapes of a 404 from GET /api/v1/chats/:id/game-state, which 404s BY DESIGN until a chat has an extracted game-state block (game-state.ts:70 answers 'Game state not found'); the game canvas reads res.status === 404 and renders a placeholder, so the page is healthy.

Why encryption-flow.browser.ts is not covered: its two trackPageErrors call sites (encryption-flow.browser.ts:66 and :110) pass only a narrow local allowlist, [/Failed to load resource.*403/], for the benign telemetry 403. Neither call site passes EXPECTED_404_NOISE_ALLOWLIST, so a game-state 404 is recorded and the blanket errors.assert() in the finally block throws on an otherwise-green test. Sibling flows that DO opt in: navigation.browser.ts:187, characters-flow.browser.ts:187, egui-transfer.browser.ts:70.

Load-dependent nature: whether the 404 trips the test is a race between the page.on('response') handler recording the failing resource and the finally-block assert running. errors.assert() sits at the last locator wait, so under an idle host the response event has not landed yet and the test passes; under gate load (many gates in parallel, CPU saturated) the response lands first and the test fails. The same file passes in isolation (exit 0) and fails in the loaded suite - a load flake, not a branch-caused failure.

Why the existing allowlist does not help here: EXPECTED_404_NOISE_ALLOWLIST is opt-in per call site. There is no global default, so any spec that opens a chat page without passing it inherits a blanket assert over every recorded resource error, including the designed 404. The characters-flow sibling defect was fixed the same way (pass the allowlist at the call site); this file was never given it.

FIX DIRECTION: pass EXPECTED_404_NOISE_ALLOWLIST at both encryption-flow.browser.ts call sites (:66 and :110), merged with the existing 403 allowance - e.g. allowlist: [...EXPECTED_404_NOISE_ALLOWLIST, /Failed to load resource.*403/] - mirroring navigation.browser.ts:187. Endpoint-scoped, so a 404 from any other resource, any non-404 failure, request failures and JS page errors still fail errors.assert(). No src/ change; the game-state 404 is a documented contract (game-state.ts:70, docs/spec/game-canvas.md) and must not be silenced by changing the endpoint.

Considered and rejected: (1) making game-state return 200-with-null or suppressing the fetch - changes the documented API for every consumer to quieten one test; (2) a blanket /404/ allowlist - would also swallow a real 500 and hide genuine product defects; (3) retrying the designed 404 - retries a permanent condition and still fails; (4) changing the product ordering - the 404 is the designed empty-state answer, not a race.

Verification requirement: run the file in isolation repeatedly (at least 15 runs) under the gate env (E2E_SAFEGUARD=1 HTTP_PROXY= NO_PROXY=*), not a single green run - a single pass is not evidence against a load-dependent flake. A negative-space check should confirm that a 500, a 500 console message and a pageerror still fail errors.assert() under the merged allowlist.

Observed 2026-10-25: the 'e2e - browser' gate during a finalize of test-contamination-frontend failed on this spec while the same spec passed in isolation (exit 0).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
