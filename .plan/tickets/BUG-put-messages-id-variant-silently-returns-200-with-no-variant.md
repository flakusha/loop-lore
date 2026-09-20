<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: PUT /messages/:id/variant silently returns 200 with no variant on out-of-bounds variantIndex

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Small

## Summary

**Status:** ❌ Rejected — code already enforces the guard (strict-review finding 2026-09-20)

**Where:** src/routes/messages/read.ts:222-228

**Defect:** None. The handler does check the OOB case:

```
const selected = variants[body.variantIndex];
if (!selected) {
  return jsonError({
    message: ctx.t?.("messages.invalidVariantIndex",) ?? "Invalid variant index",
    status: HttpStatus.BadRequest,
  },);
}
return jsonResponse(selected,);
```

OOB variantIndex already returns 400 BAD_REQUEST. The original ticket claim was based on a stale scout report that did not verify line 222-228. Closing.

## Resolution

Verified 2026-09-20 against dev ada2dd920 (src/routes/messages/read.ts:222-228). The handler already returns `HttpStatus.BadRequest` when `variants[body.variantIndex]` is undefined. No code change required.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
