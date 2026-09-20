<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: PATCH settings endpoint has no key allowlist - {...currentSettings, ...body} silently accepts arbitrary keys

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Small

## Summary

**Summary:** PATCH /settings at src/routes/settings.ts:158 spreads the request body onto currentSettings with no allowlist. Malicious bodies can inject arbitrary keys that may be reinterpreted as role/permission flags or otherwise pollute persisted settings.

**Where:** src/routes/settings.ts:158

**Defect:** 
```
{...currentSettings, ...body}
```
Any property the client sends is accepted. No Zod schema with strict key list. No reject-unknown-keys middleware.

**Fix sketch:** Define a settings-update Zod schema with .strict() (rejects unknown keys). Validate body through it before merge. Return 400 with a list of rejected keys.

**Acceptance:** A test where client sends {theme: dark, isAdmin: true} — current code persists isAdmin; fixed code returns 400 BAD_REQUEST with unknown-key error.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
