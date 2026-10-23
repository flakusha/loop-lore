<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: test debt: utils/integrations/crypto regression tests for 13 fixes

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-crypto
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Thirteen fixes land unpinned; all scoped suites green on dev (dev-baseline run proves green-to-green). Underlying bugs map to BUG-ADAPTER-SECRETS (e640965), BUG-GAME-STATE-BLOCK (1071224), BUG-A-COMMUNITY-PLUGIN-NAMED-CORE (a06afc7), all Not Started; IDOR/proto items overlap open TASK-ADD-SECURITY-REGRESSION-TESTS (e9c30c5, security scope).

Specs:

1. fetch.test.ts: shared external AbortController + short timeout asserts external listener removed after settle; raw-text path withMockFetch(Response('x'.repeat(500)), {maxSize:100, parseJson:false}) expects ok:false + Response body too large.
2. spam-gate.test.ts (new): senderAddress('User+tag@Host.com')==='user@host.com', multi-plus, angled form, no-at passthrough.
3. health.test.ts: injected clock consume at t, advance 1.5x refillMs, asserts one token and lastRefillAt advanced exactly refillMs. UNVERIFIED: negative elapsed (clock skew) behavior unchanged, not exercised.
4. assistant service/intent: RESPONSE_MAP with symbol-initial keyword () asserts match via (^|\W).
5. integrations-surface.test.ts: adapter constructor (or hasOwnProperty) asserts unknown_adapter.
6. audio-gen-route.test.ts: messageId resolving to inaccessible chat to 403; mismatching chatId to 400; unknown messageId to 404.
7. limits.test.ts: multi-byte string at cap asserts bytes(result) <= maxBytes.
8. parser.test.ts: flow-style YAML card with braces detected; TOML-with-braces still routes TOML.
9. game-state.test.ts: mid-line backtick sequence inside payload does not early-close.
10. loader.test.ts: community manifest.name core asserts built-in registry entry preserved.
11. classifier-selection.test.ts: >64KiB object returns null; normal verdict still parses.
12. llm.test.ts: assemble-mock-throws case asserts decision.fallback true, hardcoded turnPrompt, log.warn fired.

Evidence: minimal-a per-branch findings + devtests.txt baseline.

Acceptance Criteria:

- [ ] each spec added and failing-before verified
- [ ] scoped suites green

Report: .tmp/glm-review/2026-10-21/minimal-a.md.

Caveats: test-only; security-adjacent IDOR/proto cases must use fixtures, not live data; no auth change.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
