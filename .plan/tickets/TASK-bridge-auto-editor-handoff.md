<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Bridge auto-editor handoff

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-external-creative-tool-bridge
**Tags:** bridge, video, subprocess
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

auto-editor (Unlicense) subprocess tier: silence-cut generated clips + export NLE XML handoff (Kdenlive/Shotcut/Resolve/FCP/Premiere). Capability-probed, timeout-bounded, provenance-stamped. AC: a generated clip can be silence-cut in place and an NLE XML handoff file downloads and opens in a supported NLE; absent binary surfaces an exact error.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
