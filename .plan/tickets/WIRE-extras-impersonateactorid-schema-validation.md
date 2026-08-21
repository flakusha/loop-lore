<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# WIRE: verify ChatImpersonateBody schema includes impersonateActorId

**Status:** Open
**Priority:** low
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

- [ ] `ChatImpersonateBody` enforces `impersonateActorId` field
- [ ] Malformed request → 400
