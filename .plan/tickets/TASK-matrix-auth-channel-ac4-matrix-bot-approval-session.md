<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-matrix-auth-channel-ac4: Settle WAC2 — Matrix approval via Megolm-verified or unverified session

**Status:** open
**Priority:** medium
**Effort:** Small
**Type:** Task
**Summary:** Close `matrix-authentication-channels.md` open decision `[WAC2]`: should `auth-approval` over Matrix DM require a Megolm-verified device session (stronger) or accept an unverified one (availability)? Pick one, document it, gate the bot route accordingly.
**Context:** AC4 (provisioning × matrix-integration) is doc-resolved except for `[WAC2]`: "whether approval requires Megolm-verified session (stronger) or accepts unverified (availability)". Approval carries real auth weight — picking the wrong default ships a weakness or a usability cliff. The matrix also notes "DM only".

## Current state

- `src/integrations/matrix/` adapter exists (planned not built per matrix).
- `src/auth/channels/matrix-approval.ts` referenced as a route surface but no implementation.
- Matrix verification state (`m.device_list.tracked`) is queryable but unused.

**Acceptance Criteria:**

- [ ] Decision recorded in `epic-auth-channel-provisioning.md` with rationale.
- [ ] `auth-approval` over Matrix checks the verification state of the replying device; rejected (with reason) if the chosen policy requires verified.
- [ ] Bot route restricted to DM only (matrix row explicit).
- [ ] Tests: verified session succeeds, unverified session fails when policy=verified, both succeed when policy=unverified.
- [ ] `bun run check` green.

**Tags:** auth, 2fa, matrix, megolm, e2ee, WAC2, AC4
**Related:** src/integrations/matrix/, src/auth/channels/, .plan/matrix-authentication-channels.md (AC4 row, [WAC2]), epic-auth-channel-provisioning.md, epic-matrix-integration.md

git issue: c0f0d2d
