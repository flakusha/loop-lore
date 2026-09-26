<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: TOTP backup codes and WebAuthn mechanics

**Summary:** (none captured)
**Context:** (none captured)
**Summary:** Implement TOTP enrollment/verification, single-use hashed backup codes (10 codes per enrollment, sha-256 + pepper), and WebAuthn registration/assertion behind a shared challenge service. Part of `epic-auth-channel-provisioning.md` F2; mirrors the existing `epic-two-factor-auth.md` tasks.
**Context:** Per `priority-p3-p5.md` § P4, MFA (TOTP) deferred to P6+ (2026-08-05 local-only auth) and re-planned 2026-09-02 (epic-auth-channel-provisioning.md + matrix-authentication-channels.md). WebAuthn is the modern replacement; backup codes are the recovery path for both TOTP and WebAuthn loss. All three share the challenge/response service so the rotation + cooldown logic lives in one place.
**Status:** open
**Priority:** high
**Effort:** Medium
**Epic:** Authentication Channel Provisioning

## Summary

TOTP enrollment/verify, single-use hashed backup codes, WebAuthn registration/assertion behind shared challenge service. Part of epic Authentication Channel Provisioning (F2); mirrors epic-two-factor-auth tasks.

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
