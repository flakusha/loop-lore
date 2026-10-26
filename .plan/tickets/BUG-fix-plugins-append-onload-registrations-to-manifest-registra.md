<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: fix(plugins): append onLoad registrations to manifest registrations

**Status:** Done
**Priority:** medium
**Effort:** Medium
**Epic:** epic-mechanics-governance

**Summary:**

Sources: stream-b #5. Where: src/plugins/registry-store.ts:RegistryStore.setRoutes (:57-59, same shape for tools/agentRoles/uiComponents/eventHandlers/migrations); src/plugins/loader.ts:214-230 vs :240-247. Gap: registerApiRoute/registerTool/etc. during onLoad replace manifest-declared definitions (Map.set) instead of appending, so a plugin declaring both loses one set silently. Acceptance: RegistryStore setters concatenate (or offer an explicit append path); a loader test with manifest + onLoad routes coexisting shows both served. Priority: medium - silent loss of plugin routes/tools at registration time.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-26 registry-driven close: git issue 23a4754 (registry tip: 76c1230e4 Konstantin Fedotov Close issue)
