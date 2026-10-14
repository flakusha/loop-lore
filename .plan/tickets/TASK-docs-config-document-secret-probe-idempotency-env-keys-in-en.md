<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: docs(config): document secret + probe + idempotency env keys in env.example.yaml

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** auth-config-contracts

**Summary:**

Sources: stream-c #3 (blocked on T20 for the secret spellings). Where: configs/env.example.yaml:44-205; src/config/schema-class/env-map.ts:100-205. Gap: the env reference omits the auth secret keys, all `OBSERVABILITY_*` probe flags except TELEMETRY_PII_SECRET, and every `IDEMPOTENCY_*` key - the runtime-read auto-generated names (OBSERVABILITY_HEALTH_LIVENESS, IDEMPOTENCY_TTLMS) are undiscoverable from the reference file. Acceptance: secrets (SECRET-marked, using the T20-resolved spellings), probe flags, and idempotency keys appear in env.example.yaml; env-map coverage test diffs against the example file. Priority: low - docs; blocked on T20 for correct secret names.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
