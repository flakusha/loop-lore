<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Add federation to the config DOMAINS list so config.federation.toml loads

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-local-multi-instance-federation

**Summary:**

DOMAINS (src/config/load/constants.ts:23-38) does not include 'federation', so configs/config.federation.toml is silently ignored - no warning, no error, the section just stays at FEDERATION_DEFAULTS (src/config/schema-class/federation.ts:7). Only config.toml, config.local.toml, and bare env vars (src/config/load/env.ts:17) currently reach the section. Acceptance: a configs/config.federation.toml declaring enabled=true and a peers entry is loaded on boot; a config-load test asserts the domain file is picked up; the existing config-layering tests stay green.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
