<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Consent TOCTOU: revoking a chat consent during a fan-out round still exports once

**Status:** Not Started
**Priority:** low
**Effort:** Small
**Tags:** federation

**Summary:**

authorizeChatExport (src/federation/clearance.ts:83-96) reads consent once; the fan-out sequence (gate -> requestReservation -> push, src/federation/fan-out.ts) can complete even if federation_consented_at flips back to NULL mid-round, so a revoke landing between check and push still exports once. Fix: re-check consent after reservation and before push, or snapshot consentedAt in the mesh_dek_exports audit row and alert on mismatch.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
