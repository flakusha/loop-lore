<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: GET /messages/:id/variants has TOCTOU race on parent chat authorization

**Context:** (none captured)
**Acceptance Criteria:** (none captured)

**Status:** ✅ Done (closed 2026-09-20) — re-authorize parent + drop chat_id filter
**Priority:** medium
**Effort:** Medium

## Summary

**Summary:** GET /messages/:id/variants at src/routes/messages/read.ts:149 calls getMessageWithAccess which authorizes message.chat_id, then queries variants by parent_id+chat_id without re-verifying the parent belongs to an authorized chat. Two-message-mutation window allows IDOR if parent was just moved to a chat the caller cannot read.

**Where:** src/routes/messages/read.ts:149

**Defect:**

```

const msg = await getMessageWithAccess(...);

// variants: WHERE parent_id = ? AND chat_id = ?

```

Between the parent auth check and the variants query, the parent could be moved (chat_id update) to a chat the caller cannot read, but variants still resolve via the original chat_id, returning the variant body.

**Fix sketch:** Either (a) re-authorize parent chat membership inside the same DB transaction as the variants query, or (b) explicitly resolve parent chat membership and gate variants on it (not on the message.chat_id passed in).

**Acceptance:** A test where parent moves to another chat between auth check and variants query — current code returns variants; fixed code returns 403/empty.

## Resolution

src/routes/messages/read.ts: GET /messages/:id/variants re-runs getMessageWithAccess on the parent message, then queries variants by parent_id alone (chat_id no longer in WHERE).

src/routes/messages/read.coverage.test.ts: new "variants 404 when parent is moved to a chat caller cannot read" passes. 198/198 routes/messages tests pass.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
