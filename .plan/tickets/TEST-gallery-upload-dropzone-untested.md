<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TEST: gallery-upload initDropZone has no tests; file validation absent

**Status:** Open
**Priority:** low
**Priority Tier:** P5
**Effort:** Small
**Area:** gallery
**Source:** reconcile review (Scout Batch C — GAL-5)

## Evidence

`src/frontend/gallery-upload.ts` — `initDropZone` and the `DOMContentLoaded` auto-init have zero tests. No file-type validation (MIME type or extension check) exists.

## Impact

Drop zone behavior cannot be regression-tested; uploading a non-image/audio/video file is silently accepted.

## Fix

1. Add tests for `initDropZone` with mocked DOM.
2. Add file-type validation rejecting non image/audio/video MIME types.

```ts
const ALLOWED_TYPES = ["image/", "audio/", "video/"];
function isAllowedType(file: File) {
  return ALLOWED_TYPES.some(t => file.type.startsWith(t));
}
```

## Verification

- Run `bun test src/frontend/gallery-upload.test.ts`
- Manual: drop a `.pdf` → assert rejected/error shown.

## Acceptance Criteria

- [ ] `initDropZone` tested with mock DOM
- [ ] Non-image/audio/video files rejected with user-visible error
