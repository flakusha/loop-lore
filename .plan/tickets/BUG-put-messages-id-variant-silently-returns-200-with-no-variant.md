<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: PUT /messages/:id/variant silently returns 200 with no variant on out-of-bounds variantIndex

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Small

## Summary

**Summary:** PUT /messages/:id/variant at src/routes/messages/read.ts:196 looks up variants[variantIndex] but never bounds-checks. When index is out of range, selected is undefined and the request falls through to a 200 success response with the unchanged message, silently masking a client bug.

**Where:** src/routes/messages/read.ts:196

**Defect:** No `if (!selected) return badRequestResponse(...)` between the lookup and the success path. A client passing variantIndex: -1 or 999 gets a successful 200 with no mutation and no error to signal the mistake.

**Fix sketch:** After variant lookup, add explicit check: if (!selected) return badRequestResponse("variantIndex out of range").

**Acceptance:** A test with variantIndex = -1 (or = variants.length) — current code returns 200; fixed code returns 400 BAD_REQUEST.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
