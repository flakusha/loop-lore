<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: fix(integrations): wire bridge/secrets seams or return 503-not-configured

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** plugin-system

**Summary:**

Sources: stream-b #9. Where: src/routes/v1/index.ts:64 (.use(integrationsSurface(opts))); src/routes/v1/integrations-surface.ts:142-144 (unknown_adapter 404), :232-240 (bridge undefined, secrets {}). Gap: the v1 barrel calls integrationsSurface(opts) with no bridge/secrets seams (RegisterPluginsOpts carries neither field), so every webhook delivery returns unknown_adapter 404 until a bootstrap that does not exist lands - indistinguishable from a genuinely unknown adapter. Acceptance: bridge + adapterSecrets flow from config/bootstrap into the surface; unconfigured delivery returns 503-not-configured distinct from unknown-adapter 404; a test pins the unconfigured behavior. Priority: medium - entire integrations surface is dead until wired; 404 misleads integrators.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
