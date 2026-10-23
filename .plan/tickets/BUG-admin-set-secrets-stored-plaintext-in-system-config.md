<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: Admin-set secrets stored plaintext in system_config

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-crypto
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

setConfig is bare insert/upsert with no encryption (src/admin/config.ts:83-102); only YAML/TOML export redacts. Asymmetric with BYOK AES-GCM. Fix: encrypt secret-classified keys at rest or exclude from GET /admin/system-config.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
