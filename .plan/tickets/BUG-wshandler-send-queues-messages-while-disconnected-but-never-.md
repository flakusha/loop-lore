<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: WsHandler.send queues messages while disconnected but never flushes the queue on reconnect

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Small

## Summary

**Summary:** src/transport/ws.ts:72 buffers messages in pendingMessages when ws.readyState !== OPEN, but there is no flush path on reconnect. Messages sent while the WebSocket is mid-reconnect cycle are silently dropped when the new socket attaches.

**Where:** src/transport/ws.ts:72

**Defect:** The pendingMessages array grows without bound during disconnection, and is never drained when attach() swaps in a fresh WebSocket. Result: lost messages, no error to the caller.

**Fix sketch:** On attach() (when the new ws reaches OPEN state), iterate pendingMessages and ws.send each entry, then clear the queue. Also cap queue depth (e.g. drop oldest beyond N) to prevent unbounded growth during long outages.

**Acceptance:** Test: send 5 messages while socket closed, then attach new socket — current code drops all 5; fixed code delivers all 5 to the new socket.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
