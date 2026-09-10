# TASK: Gallery item download + review UI

**Epic:** epic-frontend-gallery.md
**Status:** Open
**Priority:** Medium

## Scope

- Per-item download (original + size variant) with correct filename and
  auth header handling; bulk download defers to epic-gallery-batch-operations.
- Review affordance: approve/flag/reject with reason; reviewer identity
  recorded; state visible as badge on grid + detail view.

## Acceptance

- Download works authed without opening new tab errors.
- Review action updates badge without full grid reload.
