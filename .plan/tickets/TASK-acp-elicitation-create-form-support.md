<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: ACP elicitation create form support

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-external-harness-acp
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:** Handle ACP `elicitation/create` by reusing the existing human-decision queue; fail fast on unsupported modes.

**Context:** Stable agent→client request used by opencode and codex-acp. loop-lore answers `-32601` for unknown methods, which leaves the agent waiting. Gap G16 in `.tmp/research/harness-parity/21-parity-gap-ranked.md:442-466`.

**Acceptance Criteria:**

- [ ] `elicitation/create` resolves with an accept/decline outcome from the permission-queue seam.
- [ ] Unsupported modes return an explicit JSON-RPC error rather than silence.
- [ ] Test is promise-synchronized (no sleeps); per-test fixture/adapter children reaped in `afterEach`.
