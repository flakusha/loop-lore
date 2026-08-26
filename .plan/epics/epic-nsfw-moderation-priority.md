<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: NSFW Moderation Safety Infrastructure — Priority Elevation

**Status:** ⬜ Not Started
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

- [ ] Non-public audit log of NSFW gate decisions

### User Block / Ban / Shadow

- [ ] Block users from NSFW interactions specifically
- [ ] Ban users from NSFW content entirely
- [ ] Shadow NSFW messages for specific viewers
- [ ] Collapse NSFW content in group chats
- [ ] Admin override for emergency NSFW content removal

### Internal + External Flagging

- [ ] Internal flag queue for NSFW content review
- [ ] External reporting pathway for users
- [ ] Automated NSFW content detection integration
- [ ] Flag resolution workflow with audit trail
- [ ] False report protection

### Moderation Privacy Foundation

- [ ] Privacy-first moderation (minimal data exposure)
- [ ] GDPR-compliant audit logs
- [ ] User notification of moderation actions
- [ ] Appeal mechanism for NSFW content flags
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
