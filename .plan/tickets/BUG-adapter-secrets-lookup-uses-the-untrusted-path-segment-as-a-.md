<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Adapter secrets lookup uses the untrusted path segment as a prototype-chain key

**Status:** Not Started
**Priority:** low
**Effort:** Small
**Tags:** security, integrations

**Summary:**

src/routes/v1/integrations-surface.ts:142 does deps.adapterSecrets[adapter] with the raw :adapter URL param on a plain object; the magic keys `__proto__` and `constructor` resolve to inherited values instead of undefined. Reproduced: F4 adapter=constructor -> invalid_signature vs adapter=nope -> unknown_adapter (.tmp/verify-concerns.ts). Fails closed today (the inherited value collapses into invalid_signature via the try at :161-166) but the untrusted segment performs a prototype-chain lookup on a credentials record and the observable status differs for magic keys. Fix: use a Map for adapterSecrets or guard with Object.prototype.hasOwnProperty.call before the undefined check.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
