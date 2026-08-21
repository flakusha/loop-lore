<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: chat mentions silently swallow persist/notify failures (post.ts:176-188)

**Status:** Open
**Priority:** medium
**Priority Tier:** P3
**Effort:** Small
**Area:** chat
**Source:** reconcile review (Scout Batch A — ISSUE-2)

## Evidence

`src/routes/messages/post.ts:176-188` — `persistMentions` wraps each `notifyMention` call in two layers of error suppression:

```
for (const actorId of mentionedActorIds) {
  (async () => { try { await notifyMention(...); } catch {} })();
}
void notifyMention(...).catch(() => {});
```

## Impact

- Errors inserting mention rows are silently discarded.
- Mention notifications fail silently — recipient never knows they were mentioned.
- No logging, no retry, no signal in CI.

## Fix

- Aggregate per-actor results; log at `warn` level with `chatId`, `actorId`, `err`.
- Return `{ data: { persisted: <n>, notified: <n>, failed: <n> } }` so callers can react.
- Replace `void` with `await` if response latency is acceptable, or attach `.catch` with logging.

## Verification

- Unit test: inject failing `notifyMention` mock → assert warn log + partial-failure response.
- E2E: post a message with a non-existent actor mention → assert response payload indicates failure.

## Acceptance Criteria

- [ ] Failures logged at warn
- [ ] Response carries partial-failure count
- [ ] No silent `.catch(() => {})`
