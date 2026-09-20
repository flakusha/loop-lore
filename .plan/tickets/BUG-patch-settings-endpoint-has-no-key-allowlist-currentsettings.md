<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: PATCH settings endpoint has no key allowlist - {...currentSettings, ...body} silently accepts arbitrary keys

**Status:** ✅ Done (closed 2026-09-20) — closed allowlist enforced
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

- [x] Implementation complete
- [x] Tests passing
- [ ] Documentation updated (no separate docs entry — allowlist is documented inline in `SettingsUpdateAllowedKeys` JSDoc)


## Resolution

Closed by adding a closed allowlist (`SettingsUpdateAllowedKeys` in
`src/validation/schemas/settings.ts`) and a route-layer check that rejects
unknown body keys with `400 BAD_REQUEST` and a `details.rejectedKeys` list.

TypeBox with `additionalProperties: false` strips unknown keys silently rather
than rejecting them (documented in `telemetry.test.ts`); the route layer must
do its own key check, so the PATCH body schema stays a free-form record and
the allowlist is enforced explicitly in `handleUpdateSettings` before the
spread onto currentSettings.

Acceptance test:
```ts
PATCH /api/settings  body={ theme: "dark", isAdmin: true, isModerator: 1 }
→ 400 { error: "Unknown settings keys are not allowed",
       code: "BAD_REQUEST",
       details: { rejectedKeys: ["isAdmin","isModerator"], allowedKeys: [...] } }
```

Files touched:
- `src/validation/schemas/settings.ts` — `SettingsUpdateAllowedKeys` + `SettingsUpdateBody`
- `src/routes/settings.ts` — runtime allowlist check + body schema docs
- `src/routes/settings.test.ts` — 3 new tests + 2 existing tests annotated
