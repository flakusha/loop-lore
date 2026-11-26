<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: ACP v2 protocol negotiation

**Status:** Done
**Priority:** medium
**Effort:** Large
**Epic:** epic-external-harness-acp
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:** Negotiate ACP protocol version per flavor (v1 today, v2 when advertised) instead of hardcoding `PROTOCOL_VERSION = 1`.

**Context:** ACP v2 is in draft; claude-agent-acp and codex-acp serve both v1 and v2. loop-lore always requests v1 and misses v2-only session methods, plans, notices, compaction and subagents. Gap G18 in `.tmp/research/harness-parity/21-parity-gap-ranked.md:699-717`. v2-only methods must be gated on advertisement — do not assume support from version alone.

**Acceptance Criteria:**

- [ ] Requested version is a per-flavor option; negotiated version is read from the `initialize` result.
- [ ] A v2-only method is attempted only when the agent advertised it.
- [ ] Fake fixture answers `initialize` with `protocolVersion: 2`; per-test children reaped in `afterEach`.
