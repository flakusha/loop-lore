<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: NSFW Moderation Safety Infrastructure — Priority Elevation

**Overview:** (see sections below)


**Status:** Not Started
**Status Note:** Not Started
**Priority:** High
**Effort:** Medium
**Type:** Feature Epic
**Tags:** nsfw, moderation, safety, audit, flagging
**Epic:** epic-chat-lifecycle-moderation

## Summary

Enforcement and oversight of NSFW content after or around generation: moderation events, gate-decision auditing, user block/ban/shadow, internal + external flagging, and the moderation privacy foundation. NSFW gameplay mechanics (epic-nsfw-game-mechanics, High priority, Very High effort) are fully designed, but the safety infrastructure tasks in epic-chat-lifecycle-moderation are marked "Low Priority / Postponed". This creates a compliance and safety risk: detailed NSFW encounter mechanics exist without the moderation tools to control them.

This ticket elevates the NSFW moderation tasks to High Priority. The capability side (content ratings, consent state, age gate, generation-boundary gating, user prefs/allow-lists) lives in the sibling epic `epic-nsfw-capabilities.md`.

## Linked Epics

- `epic-nsfw-capabilities.md` (capability layer — ratings/consent/gating)
- `epic-nsfw-game-mechanics.md` (gameplay mechanics)
- `epic-chat-lifecycle-moderation.md` (safety infrastructure)
- `epic-plugin-system.md` (plugin-based moderation)

## Tasks

### Gate Decision Auditing

- [x] Non-public audit log of NSFW gate decisions — `logNsfwEvent` (`src/middleware/nsfw-gate/logging.ts:56`, HMAC-hashed ids + closed reason enum); every gate decision flows through it (`src/generation/hooks/nsfw-hook-log.ts:25`); `TASK-nsfw-gate-moderation.md` Done

### User Block / Ban / Shadow

- [x] Block users from NSFW interactions specifically — `POST /api/nsfw/moderation/block` → `svc.blockUser` (`src/routes/nsfw-moderation/actions.ts:53-63`) + guard tests (`actions.routes.test.ts`); `BUG-nsfw-modactions-performedby-from-body.md` Done
- [x] Ban users from NSFW content entirely — `POST /api/nsfw/moderation/ban` → `svc.banUser` (`src/routes/nsfw-moderation/actions.ts:75-96`), `banned_at/banned_by` on `nsfw_user_preferences` (`preferences.ts:37-39`)
- [x] Shadow NSFW messages for specific viewers — `POST /api/nsfw/moderation/shadow` → `svc.shadowUser` (`src/routes/nsfw-moderation/actions.ts:97-107`); `shadow_nsfw` pref column (`preferences.ts:36`)
- [x] Collapse NSFW content in group chats — `getShadowState` returns per-viewer `"collapse"` (`src/chat/service/moderation.ts:171-179`, owner/admin-gated at :110-114)
- [ ] Admin override for emergency NSFW content removal

### Internal + External Flagging

- [x] Internal flag queue for NSFW content review — `GET /api/nsfw/moderation/flags` → `svc.getFlagQueue` (`src/routes/nsfw-moderation/flags.ts:72`), moderator+ roles accepted (`flags.routes.test.ts:7-8`)
- [x] External reporting pathway for users — `POST /api/nsfw/moderation/flags` open to any authenticated user (`requireUserId`, `flags.ts:34-36`)
- [ ] Automated NSFW content detection integration — no auto-detector in `src/` (needs owner)
- [x] Flag resolution workflow with audit trail — `PUT /flags/:id` → `svc.resolveFlag` (`flags.ts:85`); soft-deleted-action exclusion fixed (`BUG-executereversal-and-reviewappeal-do-not-exclude-soft-deleted.md` Done, worktree `fix-nsfw-soft-deleted-exclusion`)
- [ ] False report protection — only reporter-PII hashing exists (`reporterHash`, `flags.ts:8-10`); malicious-report handling unverified (needs owner)

### Moderation Privacy Foundation

> Governing ticket `TASK-moderation-privacy-first-foundation.md` is **In Progress** — the four unticked boxes below stay open until it closes; only the appeal box is ticked (independent Done tickets + shipped routes).
- [ ] Privacy-first moderation (minimal data exposure)
- [ ] GDPR-compliant audit logs
- [ ] User notification of moderation actions
- [x] Appeal mechanism for NSFW content flags — `src/routes/nsfw-moderation/appeals.ts` + two-phase submit/review/execute tests incl. self-reversal block (`appeals.routes.test.ts:297-372`); `BUG-nsfw-appeals-as-any-and-dead-route.md` + `TASK-implement-bug-nsfw-reviewappeal-auto-reverses-actions.md` both Done
- [ ] Moderator anonymity options

## Integration Points

### Systems This Epic Depends On

| System         | What It Provides            | How Used                |
| -------------- | --------------------------- | ----------------------- |
| NSFW Capabilities | Ratings, consent, toggles, prefs | Moderation gating inputs |
| Plugin System  | Moderation plugin hooks     | Custom moderation rules |

### Systems That Depend On This Epic

| System         | What It Consumes  | How Used                  |
| -------------- | ----------------- | ------------------------- |
| NSFW           | Moderation state  | Enable/disable encounters |
| Chat Lifecycle | Moderation verdicts | Chat context management   |
| Analytics      | Moderation events | Safety dashboard          |

### Cross-System Events

| Event                       | Direction  | Purpose                                 |
| --------------------------- | ---------- | --------------------------------------- |
| `nsfw.content.flagged`      | emits      | Trigger moderation queue                |
| `nsfw.content.moderated`    | emits      | Update content visibility               |
| `moderation.action.applied` | emits      | Audit trail, analytics                  |
| `consent.revoked`           | subscribes | Disable NSFW encounters                 |

## Chat Audit 2026-08-25 — Related Findings

- **B4:** moved to `epic-nsfw-capabilities.md` Open Items (rating enum unwired is a capability-wiring gap).
- **B7:** RECLASSIFIED 2026-08-25 — NOT a defect. Raw `Date` in `src/chat/types/nsfw.ts` is idiomatic project-wide; branded timestamps only at serialization boundaries. No change. Real gap is B4 (enum unwired). The broader need for proper date representation (locale/region + IANA timezone, backend + frontend) is now tracked as FEAT-unified-date-representation-util-locale-region-iana-timezone (issue 7118f58, epic-i18n).

_Source: chat functionality audit (loop-lore), 2026-08-25._

## Bridge points

- Consumes capability state from `epic-nsfw-capabilities.md` (rating tier, consent incl. `consent.revoked`, per-chat/user/world toggles) as gating inputs.
- Moderation verdicts (flags, blocks, bans) may constrain capabilities preferences (e.g., revoke or downgrade NSFW enable).
- Audit log records gate decisions originating from capabilities gating.

## Docs-Gap Audit Remainders (2026-09-19)

- [ ] [gap-audit E2] Per-attachment rating pipeline thresholds + review triggers
- [ ] [gap-audit E23] Attachment-specific flagged-content review queue UI (approve/reject workflow)
