---
hash: upgrade-metadata-loss

git issue: c92bfc9


**Summary:** upgrade.ts mutates newConnection.metadata in-place, losing old state when catch branch assigns upgradedFrom.
**Context:** src/transport/upgrade.ts:87 — newConnection.metadata assigned from fresh createProtocol factory, then Object.assign mutates it in-place.
**Acceptance Criteria:** (none)

<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: upgrade.ts metadata state lost — Object.assign mutates newConnection.metadata in-place, erasing fresh factory metadata

**Status:** done
**Priority:** High
**Effort:** Low

## Summary

`src/transport/upgrade.ts:87` calls `createProtocol(newConfig)` which invokes `handler.connect()`, returning a `Connection` with its own `metadata` object produced by the factory (e.g., HTTP/2 stream state, WebSocket ping/pong config). The code then calls `Object.assign(newConnection.metadata, state, { upgradedFrom: ... })`, which mutates `newConnection.metadata` **in-place** — discarding the factory-produced metadata and replacing it with the merged state from the old connection.

This means the new handler's native metadata (e.g., ` multiplexing: true`, `maxConcurrentStreams: 100` for HTTP/2, or `pingPong: true` for WebSocket) is permanently lost from the returned `Connection` object. Any caller that reads `newHandler.connect()` and inspects `conn.metadata` gets an incomplete picture.

The test at `src/transport/upgrade.test.ts:80-99` masks the bug: it adds custom metadata to the old handler (`Object.assign(conn1.metadata, ...)`) then asserts those keys appear on the new connection — but it never asserts that the factory-native keys survive the upgrade.

## Defect Summary

`src/transport/upgrade.ts:87`:

```ts
Object.assign(newConnection.metadata, state, { upgradedFrom: currentConnection.protocol },);
```

`newConnection.metadata` starts as `{ multiplexing: true, serverPush: true, maxConcurrentStreams: 100 }` (HTTP/2) or `{ pingPong: true, pingInterval: 30000 }` (WebSocket). `Object.assign` replaces it with `{ ...state, upgradedFrom: ... }`, losing the factory keys entirely.

## Fix Outline

Replace the in-place mutation with a new object spread, then replace `newConnection.metadata` on the connection returned by `connect()` before it is returned to the caller:

```ts
const newConnection = await newHandler.connect();
newConnection.metadata = { ...newConnection.metadata, ...state, upgradedFrom: currentConnection.protocol };
```

## Existing-Ticket-Check-Result

No prior BUG ticket found for `upgradeConnection metadata state lost`. grep over `.plan/tickets/` for `upgrade.*metadata|metadata.*upgrade|Object\.assign.*metadata` returned no BUG-* matches. Not a duplicate.
