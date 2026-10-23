<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: allowUserApiKey defined but never enforced

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-byok-api-keys
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Schema fields exist (src/config/schema/providers.ts:34-35,137; env default-true load/env.ts:94) but zero reads in src/generation, src/routes, src/aux-pipeline — only tests/fixtures. Provider with allowUserApiKey:false still gets user BYO key. Fix: gate BYO lookup in resolveProvider (registry.ts:110-172) on resolved provider instance flag.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
