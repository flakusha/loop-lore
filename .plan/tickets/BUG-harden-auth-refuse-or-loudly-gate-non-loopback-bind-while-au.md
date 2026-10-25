<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: harden(auth): refuse or loudly gate non-loopback bind while auth.required=false

**Status:** Done
**Priority:** low
**Resolved:** LIVE confirmed on tip — repro (validateAuthSafety with solo config + server.host=0.0.0.0 threw nothing) failed pre-fix; validateAuthSafety solo branch now throws "AUTH SAFETY: ... not a loopback address" for explicit non-loopback hosts unless UNSAFE_SOLO_REMOTE_BIND=true, via new isLoopbackHost classifier (src/config/load/safety.ts:55-72,76-124); gate runs at loadConfig() in start.ts:46 before serve() at :162. Empty/unset host skips the gate (fixture configs use host=""). 62/62 load tests green, gates green 2026-10-25, branch fix/bug-sweep.
**Effort:** Medium
**Epic:** epic-auth-config-contracts

**Summary:**

Sources: stream-c #7. Where: src/middleware/auth/authenticate.ts:160-177 (solo fallback); src/config/sections/auth.ts:7; src/config/sections/server.ts:14 (host: localhost); src/server/start.ts:126. Gap: with auth.required=false, every JWT-less request resolves to the solo super-user, so requiresAuth/requirePermission never deny. The default localhost bind contains this to loopback, but an operator changing host to LAN/0.0.0.0 without flipping auth.required silently exposes admin-equivalent access behind only an advisory boot warning. Acceptance: non-loopback bind with auth.required=false fails boot (or requires an explicit opt-in flag); default loopback solo-mode behavior is unchanged. Priority: low - default bind is safe; risk needs an explicit host change, but the consequence (network-wide admin) warrants fail-closed.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-25 registry-driven close: git issue efe1b48 (registry tip: 1ade396c6 Konstantin Fedotov Close issue)
