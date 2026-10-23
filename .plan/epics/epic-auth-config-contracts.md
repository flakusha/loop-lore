<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Auth Config Contracts

**Overview:** (see sections below)

**Status:** Not Started
**Priority:** P2
**Effort:** Medium
**Type:** Bug Epic / Hardening
**Tags:** auth, config, secrets, contracts, hardening
**Issue:** (none)

## Summary

Auth's security posture is set by configuration, but the config surface and the
auth runtime disagree in several places: documented env names are ignored
(`AUTH_JWT_SECRET` / `AUTH_CSRF_SECRET`), two independent expiry knobs
(`sessionTimeoutHours`, `jwtExpiresIn`) can drift apart with no warning, and
`auth.required=false` still permits a non-loopback bind with no gate or noise.
This epic makes the auth configuration contract explicit, wired, and
self-checking: every documented name is honored, divergent settings warn at
boot, and unsafe combinations fail loudly.

## Scope

1. **Secret wiring**: honor the documented `AUTH_JWT_SECRET` /
   `AUTH_CSRF_SECRET` env names (or fix the docs — one source of truth, not two).
2. **Expiry agreement**: warn at boot when `sessionTimeoutHours` and
   `jwtExpiresIn` diverge, so cookie lifetime and token lifetime cannot silently
   disagree.
3. **Bind gating**: refuse (or loudly gate with an explicit override) a
   non-loopback bind while `auth.required=false`.
4. **Docs parity**: config examples list the auth/security fields; secret-probe
   env keys and idempotency are documented; readiness vs health probe semantics
   are disambiguated in the docstrings.

## Tasks

- [ ] `BUG-fix-config-wire-auth-jwt-secret-auth-csrf-secret-env-names-d` — wire the documented env names
- [ ] `BUG-fix-auth-warn-when-sessiontimeouthours-and-jwtexpiresin-dive` — divergence warning
- [ ] `BUG-harden-auth-refuse-or-loudly-gate-non-loopback-bind-while-au` — bind gating
- [ ] `TASK-docs-config-add-missing-sections-to-config-examples` — config example parity
- [ ] `TASK-docs-config-document-secret-probe-idempotency-env-keys-in-en` — secret-probe docs
- [ ] `TASK-docs-probes-fix-readiness-docstring-document-api-health-vs-h` — probe docstring fix

## Acceptance Criteria

- [ ] Documented secret env names take effect (or docs match the implemented names) — exactly one contract
- [ ] Boot warns (or refuses) on `sessionTimeoutHours` / `jwtExpiresIn` divergence
- [ ] Non-loopback bind with `auth.required=false` is refused or gated behind an explicit, logged override
- [ ] Config examples, secret-probe docs, and probe docstrings match implemented behavior
- [ ] Member bugs have regression tests for the contract they pin

## Related Epics

- `epic-auth-access.md` — session-expiry fail-closed semantics (sibling auth-cluster bug re-homed there)
- `epic-api-rate-limiting.md` — anonymous telemetry write gating (same hardening sweep)
- `epic-error-envelope.md` — 429 response content negotiation (same sweep)
- `epic-continuous-improvement.md` — review-rule hardening pattern

## Bind Tickets

- `BUG-fix-config-wire-auth-jwt-secret-auth-csrf-secret-env-names-d.md` (open)
- `BUG-fix-auth-warn-when-sessiontimeouthours-and-jwtexpiresin-dive.md` (open)
- `BUG-harden-auth-refuse-or-loudly-gate-non-loopback-bind-while-au.md` (open)
- `TASK-docs-config-add-missing-sections-to-config-examples.md` (open)
- `TASK-docs-config-document-secret-probe-idempotency-env-keys-in-en.md` (open)
- `TASK-docs-probes-fix-readiness-docstring-document-api-health-vs-h.md` (open)
