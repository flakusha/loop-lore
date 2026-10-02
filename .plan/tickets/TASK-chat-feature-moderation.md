<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Moderation — Ban, Kick, Mute, NSFW & Non-NSFW Point Flags

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Done (2026-10-01)
**Priority:** High
**Effort:** High
**Epic:** epic-chat-product-features

## Summary

Complete the moderation surface across chat scope: ban (full removal), kick (immediate removal with rejoinable history), mute (silence output and/or input), and NSFW / non-NSFW point flags that escalate into the audit pipeline. Each action must write an audit trail and respect consent / NSFW gate rules.

## Acceptance Criteria

- [x] Ban removes participation and prevents rejoin for the configured scope
- [x] Kick removes the actor immediately but leaves history intact and rejoinable
- [x] Mute suppresses both inbound and outbound traffic for the muted actor
- [x] NSFW point flag triggers `src/generation/hooks/moderation-hook.ts` and writes to the audit ledger
- [x] Non-NSFW point flag (e.g. toxicity, off-topic) flows the same audit path with the appropriate severity tag
- [x] All four actions are admin/owner gated via `src/middleware/permissions.ts`
- [x] Audit trail is queryable for compliance via `src/middleware/nsfw-gate/logging.ts`


## Verification (2026-10-01, evidence-first close)

- **AC1** — `applyBan` (`src/chat/moderation.ts:303`): stamps `chat_participants.banned_until`
  (indefinite = year-9999 sentinel), never inserts a participant row; `isParticipantBanned`
  blocks the join path for the configured scope. DB-primitive suite in
  `src/chat/moderation.test.ts`.
- **AC2** — `applyKick` (`src/chat/moderation.ts:380`): deletes only the participant row
  (messages untouched); normal invite/join flow re-admits the kicked actor.
- **AC3** — inbound: `enforceMuteGate` (`src/routes/messages/guards.ts:106`) wired at
  `routes/messages/create.ts:60` (403 before any side effect; `mute-gate.test.ts` covers
  decision table + route level). Outbound: `resolve-actor.ts` (cascade + normal pre-select),
  `group-chat/turn-selector.ts:90` (mention eligibility), `turning/turn-manager/participants.ts:35`
  (selection) all drop actors while `isMuted(...)`.
- **AC4** — `applyFlag` kind `flag-nsfw` runs `ModerationHook.execute`
  (`src/chat/moderation.ts:30`) so severity/keyword scoring is shared with content scans;
  the hook writes the audit row (`moderation-hook.ts` catch-warns on failure).
- **AC5** — kind `flag-tox` is the identical audit path with a distinct severity tag
  (toxicity / off-topic escalation that the hook did not fire).
- **AC6** — route gate `src/routes/chats/moderation.ts:101` uses
  `checkChatSettingsAccess` (admin / creator / owner / GM pass; member / observer /
  guest / stranger forbidden), preserving `src/middleware/permissions.ts` role semantics.
  Tests: `src/routes/chats/moderation.test.ts`.
- **AC7** — `writeAuditPair` writes `moderation_actions` + `log_entries` inside the
  primitive transaction; `src/middleware/nsfw-gate/logging.ts` is the compliance query path.
- Tests run 2026-10-01: `bun test --isolate --parallel=4 src/chat/moderation.test.ts
  src/routes/messages/mute-gate.test.ts src/chat/service/access.test.ts` → 63 pass / 0 fail;
  `src/routes/chats/moderation.test.ts` → 9 pass / 0 fail.

## Related Tickets / Epics

- epic-chat-product-features
- epic-chat-lifecycle-moderation
- TASK-nsfw-moderation-delete-audit-regression-verify
- TASK-moderation-actions-frontend
- TASK-nsfw-gate-moderation-events

## Files

- `src/chat/moderation.ts`
- `src/chat/types/moderation.ts`
- `src/middleware/nsfw-gate/access.ts`
- `src/middleware/nsfw-gate/consent.ts`
- `src/middleware/nsfw-gate/logging.ts`
- `src/generation/hooks/moderation-hook.ts`
- `src/profanity/service.ts`

## Open Questions

- Does mute affect only the active chat, or all chats the actor shares with the muter?
- Are NSFW / non-NSFW point flags discrete counters, or a unified severity rubric?

**Resolved:** 2026-10-02 registry-driven close: git issue 764761a (registry tip: f8944fadf gate Auto-closed: appended .md marker marks TASK-CHAT-FEATURE-MODERATION done)
