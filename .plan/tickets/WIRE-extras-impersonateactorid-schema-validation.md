<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# WIRE: verify ChatImpersonateBody schema includes impersonateActorId

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Closed (2026-09-18, reconciliation verified)
**Priority:** low
**Priority Tier:** P5
**Effort:** Small
**Area:** impersonation
**Source:** reconcile review (Scout Batch C — IMP-5)

## Evidence

`src/routes/chats/extras.ts:144` — `body.impersonateActorId` is cast via `as typeof ChatImpersonateBody.static`. No explicit Elysia `t.Object` schema enforcement visible in the file. If `ChatImpersonateBody` omits the field or uses `t.Optional` without a default, malformed requests silently pass `undefined` → `?? null` → passed to `updateImpersonation`.

## Impact

Low risk — `?? null` covers the undefined case. But schema should enforce the field.

## Fix

Verify `ChatImpersonateBody` is defined as:

```ts
const ChatImpersonateBody = t.Object({
  impersonateActorId: t.String(),   // NOT Optional
});
```

If `Optional`, add `.default("")`.

## Verification

- Add integration test: POST with missing `impersonateActorId` → 400 (schema validation error).
- Review `src/routes/chats/types.ts` or wherever `ChatImpersonateBody` is defined.

## Acceptance Criteria

- [x] `ChatImpersonateBody` enforces `impersonateActorId` field
- [x] Malformed request → 400

## Resolution (2026-09-18)

Verified enforced: `ChatImpersonateBody` is a non-Optional `t.Object({ impersonateActorId: t.String() })` at `src/validation/schemas/chat.ts:198-200`, mounted on `PUT /api/chats/:id/impersonate` (`src/routes/chats/extras.ts:141-168`); missing-field → 400 covered by `src/routes/chats/chat.test.ts:317-341`. The `?? null` in extras.ts is dead against the schema. No code change required.
