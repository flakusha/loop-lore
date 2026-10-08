<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Adapter secrets lookup uses the untrusted path segment as a prototype-chain key

**Status:** Wontfix
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


## Resolution

The lookup IS bypassable as described. `deps.adapterSecrets[adapter]`
(`src/routes/v1/integrations-surface.ts:142`) indexes a plain `Record` with the
raw path segment, so `constructor`, `toString`, `valueOf`, `__proto__`, and
`hasOwnProperty` resolve to inherited values instead of `undefined`.

It fails closed. The resolved value is passed to `resolveCredential`
(`src/integrations/secrets.ts:166-171`), whose first statement is
`value.startsWith(SECRET_REF_PREFIX,)`. Every prototype value is a function or
an object, so it throws `TypeError: value.startsWith is not a function`, and
the `catch` at `src/routes/v1/integrations-surface.ts:161-166` collapses that to
`invalid_signature`. No signature is bypassed and no secret is disclosed.

The only observable difference is the status code — 401 (`invalid_signature`)
for magic keys versus 404 (`unknown_adapter`) for a genuinely unknown adapter.
That difference is not sensitive and does not enumerate credentials.

Wontfix: the prototype-chain lookup is a hygiene issue, not a security defect.
The `Object.prototype.hasOwnProperty.call` guard named in the Summary remains a
reasonable hardening if this surface is ever wired in production.
