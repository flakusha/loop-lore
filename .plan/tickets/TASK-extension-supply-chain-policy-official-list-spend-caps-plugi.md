<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Extension supply-chain policy: official-list, spend caps, plugins off by default

**Status:** Done
**Priority:** medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

May-2026 ST Bot Browser incident: extension stole API keys. Policy for our plugin system (same attack surface): prefer official list, per-key spend caps, server plugins off by default, prune-unused guidance. Scope: policy doc + enforcement hooks (spend caps, default-off flag); complements auth-channel provisioning + scoped-credentials epics. Research: metaapps gap 7.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
