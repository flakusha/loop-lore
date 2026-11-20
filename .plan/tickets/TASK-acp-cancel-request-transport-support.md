<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: ACP cancel_request transport support

**Status:** Done
**Priority:** medium
**Effort:** Small
**Epic:** epic-external-harness-acp
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:** Support JSON-RPC `$/cancel_request` to cancel any in-flight ACP request.

**Context:** ACP defines `$/cancel_request` for arbitrary in-flight requests; loop-lore only sends `session/cancel`. Gap G23 in `.tmp/research/harness-parity/21-parity-gap-ranked.md:721-737`. `session/cancel` covers the prompt turn but not other held requests.

**Acceptance Criteria:**

- [ ] `jsonrpc-process.ts` cancels a pending request by id with a typed cancellation error.
- [ ] The transport remains usable for the next request after cancellation.
- [ ] Fixture holds the request open until the cancel under test (never a sleep) and is reaped in `afterEach`.
