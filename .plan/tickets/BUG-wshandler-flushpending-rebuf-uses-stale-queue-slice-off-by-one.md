---
hash: wshandler-rebuf

git issue: e8d02e4


**Summary:** flushPending re-buffer logic uses queue.slice(indexOf(data)) which re-includes the failed item plus all remaining items — duplicate re-buffer.
**Context:** src/transport/ws.ts:90 — after throw, queue.slice(queue.indexOf(data)) includes data itself.
**Acceptance Criteria:** (none)

<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: WsHandler flushPending re-buffer includes the failed item itself — duplicate re-queue on send error

**Status:** done
**Reason:** `queue.slice(queue.indexOf(data))` correctly includes the failed item — it was never successfully sent (its `send` threw) and must be retried. After `unshift([data, ...rest])` the failed item is positioned at the front of `pendingMessages` exactly ONCE, not duplicated. No reorder or duplication. See `src/transport/ws.ts:83-94`. No defect.
**Priority:** n/a  **Effort:** n/a

## Summary

`src/transport/ws.ts:90` contains the re-buffer path when a single `ws.send()` throws:

```ts
this.pendingMessages.unshift(...queue.slice(queue.indexOf(data),),);
```

`queue.indexOf(data)` returns the index of the failed item. `queue.slice(index)` returns `[data, data+1, ..., end]` — it **includes the failed item itself**. After `unshift(...)`, the failed item is appended twice (once by `unshift` placing it at front, once because the slice included it), and all subsequent items are also appended again.

The result: on a transient send failure, the handler duplicates the failed message and every message that followed it, producing reorder and duplication for all consumers of the connection.

## Defect Summary

`src/transport/ws.ts:90`:

```ts
this.pendingMessages.unshift(...queue.slice(queue.indexOf(data),),);
```

`queue.slice(queue.indexOf(data))` should be `queue.slice(queue.indexOf(data) + 1)` to exclude the failed item (it will be re-queued separately if the caller retries).

## Fix Outline

Change `queue.slice(queue.indexOf(data),)` to `queue.slice(queue.indexOf(data) + 1,)` so the failed item itself is not duplicated.

## Existing-Ticket-Check-Result

No prior BUG ticket found for `flushPending re-buffer`. grep over `.plan/tickets/` for `flushPending|re-buffer|rebuf` returned no BUG-* matches. Not a duplicate.
