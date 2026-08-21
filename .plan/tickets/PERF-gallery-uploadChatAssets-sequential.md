<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# PERF: gallery uploadChatAssets runs uploads sequentially

**Status:** Open
**Priority:** medium
**Effort:** Small
**Area:** gallery
**Source:** reconcile review (Scout Batch C — GAL-2)

## Evidence

`src/frontend/alpine/chat-utils/gallery.ts:98-140` — `uploadChatAssets` iterates with `for (const file of files) { await upload(file); }`. Each upload waits for the previous.

## Impact

20 assets × 2s upload = 40s total. Trivially parallelizable.

## Fix

```ts
await Promise.all(files.map(file => uploadChatAsset(file)));
```

If server or DB has writeconcurrency concerns, add a concurrency limit via `p-limit`.

## Verification

- Performance test: 20 files → wall-clock ≤ 2× single upload (parallelization confirmed).

## Acceptance Criteria

- [ ] All uploads in parallel
- [ ] Error in one file does not cancel others
