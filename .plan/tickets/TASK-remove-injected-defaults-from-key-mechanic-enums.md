<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: remove injected defaults from key mechanic enums

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Epic:** epic-api-validation-guardrails.md
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Two key-mechanic enum schemas inject the first union member when the client omits the field. That silently rewrites an omitted value and is the same class as the previously fixed adminConfig incident.

**Evidence (dev 2026-11-18):** t.UnionEnum injects first-member defaults at src/validation/schemas/primitives.ts:110,115; affected db-schemas.ts:92,675; guard at src/validation/schemas/crud/update.ts:66-85; default-free literal-union pattern at worlds.ts:42; recorded incident FIXED:34.

**Scope:** convert assistantRole and type to literal unions without injected defaults; keep the manage.ts raw-body fix as defense in depth; add schema and online tests that omitted stays omitted, including assistantRole.

**Acceptance Criteria:**

- [ ] omitted assistantRole is not defaulted
- [ ] valid explicit values still pass
- [ ] validation tests assert omission rather than only successful parse

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)
