<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-matrix-auth-channel-ac3: Settle WAC1 — capability-enum naming match for `auth-challenge`

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Epic:** epic-matrix-integration.md
**Type:** Task
**Summary:** Close `matrix-authentication-channels.md` open decision `[WAC1]` by aligning the `auth-challenge` capability flag in `src/integrations/` with the canonical integrations-core capability registry (string vs symbol, namespacing, single-source enum).
**Context:** AC3 (provisioning × integrations-core) is doc-resolved except for `[WAC1]`: "capability enum naming must match core epic's registry shape when it lands". Until then, OTP delivery has no canonical enum entry. This ticket is the small fix that lands once the registry shape is fixed.

## Current state

- `src/integrations/` adapter capability flags exist in ad-hoc shape.
- `src/auth/channels/` references flags by string literal in at least one site (grep-confirm in scope).
- No central `Capability` enum exported from `src/integrations/`.

**Acceptance Criteria:**

- [ ] Single `Capability` enum in `src/integrations/capabilities.ts` with `AuthChallenge = 'auth-challenge'` and `AuthApproval = 'auth-approval'` entries.
- [ ] All `src/auth/channels/` references use the enum (no string literals).
- [ ] Tests pin: adapters lacking the flag are skipped by the ladder (not faked) — invariant from matrix row AC3.
- [ ] `bun run check` green.

**Tags:** auth, 2fa, capability-registry, integrations, WAC1, AC3
**Related:** src/auth/channels/, src/integrations/, .plan/matrix-authentication-channels.md (AC3 row, [WAC1]), epic-auth-channel-provisioning.md, epic-integrations-core.md

git issue: 5719d09
