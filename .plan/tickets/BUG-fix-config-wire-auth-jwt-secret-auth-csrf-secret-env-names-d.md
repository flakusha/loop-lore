<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: fix(config): wire AUTH_JWT_SECRET/AUTH_CSRF_SECRET env names (documented names are ignored)

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** auth-config-contracts

**Summary:**

Sources: stream-c #2. Where: src/config/schema-class/env-map.ts:65 (key generation), :122-132 (manual overrides); src/config/sections/auth.ts:86-96; src/config/load/safety.ts:81-124. Gap: every doc string and error message tells operators to set AUTH_JWT_SECRET/AUTH_CSRF_SECRET, but envMap() auto-generates AUTH_JWTSECRET/AUTH_CSRFSECRET and the override table has no entry for either name - the documented variables are silently ignored. Failure is fail-closed at boot via validateAuthSafety, so impact is a mystery-boot-error, not a bypass - but it strikes exactly the operators following the docs. Acceptance: setting the documented AUTH_JWT_SECRET/AUTH_CSRF_SECRET spellings populates auth.jwtSecret/auth.csrfSecret (verify by resolving config with only those vars set). A regression test asserts every env name cited in authMeta resolves through ENV_MAP. Priority: high - documented secret setup path is broken at the auth trust boundary; every multi-user operator hits it.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
