<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Make `FanOutContent.chatId` Non-Optional or Default-Deny

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Epic:** epic-licensing
**Related:** `src/federation/fan-out.ts`, `src/federation/clearance.ts`, `src/federation/clearance.test.ts`, `TASK-licensing-publish-enforcement-point.md`, `TASK-licensing-publish-authorization-predicate.md`
**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

Close the optional-field gate bypass in the federation fan-out path — a
**plan-hygiene defect**, not a licensing bug: the clearance gate can be skipped
entirely by omitting one field. Filed under `epic-licensing.md` because the
publish-gate tickets cite this exact code as their pattern reference, and the
pattern has a hole in it.

## Context

**The defect (verified):**

- `FanOutContent.chatId` is **OPTIONAL** (`src/federation/fan-out.ts:49`).
- The gate call site is `if (content.chatId !== undefined)`
  (`:168`) — an absent chatId skips `authorizeChatExport` for every target.
  No reservation is blocked, no denial is recorded; the content ships
  ungated.
- The invariant lives only in a doc comment: `:47` — "Chat content must
  always set this." Nothing in the type system or the gate enforces it.
- `src/federation/clearance.test.ts:172-184` positively exercises the
  no-chatId path as expected behavior ("content without a chat id is not
  chat-gated") — the test suite currently locks the bypass in.

**Why it is filed here.** `TASK-licensing-publish-enforcement-point.md` names
this code as the shape to copy for the publish gate's structurally
unavoidable verdict. Copying `if (field !== undefined)` into a publish gate
would reproduce the bypass on a security boundary. The fix below is also the
counterexample the publish gate cites.

**The fix — one of two shapes, implementer picks:**

1. Make `chatId` **required** on `FanOutContent`; genuinely non-chat blobs
   (if any exist) move to a separate content type with its own explicit path.
2. **Default-deny**: every fan-out requires a clearance verdict; non-chat
   content gets an explicit non-chat gate that says so in the type, not in a
   comment.

Either way, the doc-comment invariant becomes a type-level or gate-level fact.

**COPY while fixing:** the scoped-write discipline from
`src/routes/federation-mesh-retract.ts:63-67` — a miss must surface as a
failure, never as a silent skip — and the branded-verdict shape from
`src/federation/clearance.ts:29`.

**Nothing in this ticket changes licensing behavior.** It is tracked so the
defect is fixed deliberately next to the work that depends on its absence,
rather than discovered later.

## Acceptance Criteria

- [ ] `chatId` is non-optional, OR the fan-out gate is default-deny for all
      content — the `content.chatId !== undefined` skip (`fan-out.ts:168`) is
      gone
- [ ] The invariant at `fan-out.ts:47` is enforced by the type system or the
      gate, not by the doc comment
- [ ] `clearance.test.ts:172-184` ("content without a chat id is not
      chat-gated") is rewritten to the new contract — explicit non-chat path
      or compile error, not a silently ungated push
- [ ] Consented chat pushes are behaviorally unchanged
      (`clearance.test.ts:155-170` stays green)
- [ ] Any genuinely non-chat content that exists today has an explicit,
      tested path under the new contract
