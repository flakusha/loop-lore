<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: harness default profile alias

**Status:** Done
**Priority:** high
**Effort:** Medium
**Epic:** epic-harness-integration

**Summary:** Treat `"default"`/omitted profile as an explicit unpinned harness gate state that uses the selector failover order, while exec-log attribution always records the resolved profile.

**Context:** Operator decision 2026-11-24 (.tmp/research/harness-acp-sdk-next-job-plan-2026-11-24.md, section 3): `default` means implicit failover, never a synthetic profile. Slice A reserves the name in config validation. Slice B implementation is in worktree tree/harness-default-alias, stacked on the transport commit; no finalization or landing in this lane.

**Caveats:** TOCTOU, security, authorization, parallelism, partial failure, rollback, stale state, idempotency, observability

**Acceptance Criteria:**

- [ ] One normalization point admits `"default"`/omitted/empty only when at least one profile is configured; unknown names still deny; disabled and role denials unchanged.
- [ ] Gate returns a typed unpinned allowed verdict with no synthetic profile object and no caller-supplied argv.
- [ ] Dispatch omits `requirement.profile` for unpinned so the existing failover order runs; pinned names still pin exactly.
- [ ] ToS acknowledgement skip in the selector is unchanged; no widening of role or profile allowlists.
- [ ] Exec-log success records `attributed.profile`; failure records a stable non-alias marker, never `"default"`.
- [ ] Tests cover alias failover, pinned pinning, unknown/no-profile denial, unchanged ToS skip, and exact attribution.
