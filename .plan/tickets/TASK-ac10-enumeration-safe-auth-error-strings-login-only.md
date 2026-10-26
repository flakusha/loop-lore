<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: AC10 enumeration-safe auth error strings (login-only)

**Status:** Done (Status Note: implemented in commit 8187ec1b9 — unified "Invalid username or password." / 401 / auth.invalidCredentials across unknown-user, wrong-password, and disabled/deactivated logins; auth.accountLocked key removed from all 10 locales with naturalized invalidCredentials translations; login.test.ts asserts identical message + JSON status shape; tsc, eslint, dprint, auth tests (38 pass), and i18n gates green.)
**Priority:** medium
**Effort:** Small
**Epic:** epic-auth-access

**Summary:**

**Status:** Done
**Priority:** medium
**Effort:** S (unified login strings plus locale reconciliation and test updates)
**Summary:** Login failures return one identical message for unknown-user, wrong-password, and locked-or-gated states, removing the state oracle. Login-only scope.
**Context:** Source row matrix-authentication-channels.md AC10 (provisioning x nsfw/age-gate identical messages). Filed from 02-extract-features.md candidate 8, R02 candidate 8 confirmed with correction. Files: src/routes/auth/login.ts (login-only; register.ts shares no strings per R02) plus src/public/locales/en.json and the other 9 locale files. Must reconcile code fallback Account is disabled vs en.json Account is locked by picking one. Budget login.test.ts and responses.test.ts assertion updates plus 10 locale files. Dedup: grepped index.json for enumerat and AC10; only unrelated asset/blog enumeration bugs.
**Acceptance Criteria:**
- Unknown-user, wrong-password, and locked-or-gated logins return the identical message and status shape.
- Fallback string and locale strings reconciled to one wording.
- login.test.ts and responses.test.ts updated to assert identical strings.
- All 10 locale files carry the unified string.
- bun run check green.
**Related:** candidate 8, R02 candidate 8, FB8 login notification (coordinate messaging).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated
