# TASK: NSFW Moderation Safety Infrastructure — Priority Elevation

**Status:** 🟡 In Progress
**Priority:** High
**Effort:** Medium
**Type:** Feature Epic
**Tags:** nsfw, moderation, safety, consent, audit, flagging
**Epic:** epic-chat-lifecycle-moderation

## Summary

NSFW gameplay mechanics (epic-nsfw-game-mechanics, High priority, Very High effort) are fully designed, but the safety infrastructure tasks in epic-chat-lifecycle-moderation are marked "Low Priority / Postponed". This creates a compliance and safety risk: detailed NSFW encounter mechanics exist without the moderation tools to control them.

This ticket elevates the NSFW moderation tasks to High Priority and adds consent tracking.

## Linked Epics

- `epic-nsfw-game-mechanics.md` (gameplay mechanics)
- `epic-chat-lifecycle-moderation.md` (safety infrastructure)
- `epic-character-core-system.md` (NSFW content rating)
- `epic-plugin-system.md` (plugin-based moderation)

## Acceptance Criteria

### NSFW Gate & Moderation Events

- [ ] NSFW enable/disable at per-chat, per-user, per-world level
- [ ] Non-public audit log of NSFW gate decisions
- [x] NSFW content rating enforcement (5-tier from Character Core) — `ContentRating` enum + TypeBox schema
- [x] Consent state tracking (from TASK-shared-schemas) — `ConsentState` TypeBox schema
- [ ] Integration with generation boundary (LLM request filtering)

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

| System         | What It Provides                    | How Used                |
| -------------- | ----------------------------------- | ----------------------- |
| NSFW           | Content rating, encounter mechanics | Moderation gating       |
| Character Core | NSFW content rating                 | Content filtering       |
| Shared Schemas | ConsentState, NSFWContentRating     | Enforcement contracts   |
| Plugin System  | Moderation plugin hooks             | Custom moderation rules |

### Systems That Depend On This Epic

| System         | What It Consumes  | How Used                  |
| -------------- | ----------------- | ------------------------- |
| NSFW           | Moderation state  | Enable/disable encounters |
| Chat Lifecycle | NSFW toggle       | Chat context management   |
| Analytics      | Moderation events | Safety dashboard          |

### Cross-System Events

| Event                       | Direction  | Purpose                                 |
| --------------------------- | ---------- | --------------------------------------- |
| `nsfw.toggle`               | emits      | Enable/disable NSFW for chat/user/world |
| `nsfw.content.flagged`      | emits      | Trigger moderation queue                |
| `nsfw.content.moderated`    | emits      | Update content visibility               |
| `moderation.action.applied` | emits      | Audit trail, analytics                  |
| `consent.revoked`           | subscribes | Disable NSFW encounters                 |

## Tasks

### NSFW Gate & Moderation Events

- [ ] NSFW enable/disable at per-chat, per-user, per-world level
- [ ] Non-public audit log of NSFW gate decisions
- [x] NSFW content rating enforcement (5-tier from Character Core) — `ContentRating` enum + TypeBox schema
- [x] Consent state tracking (from TASK-shared-schemas) — `ConsentState` TypeBox schema
- [ ] Integration with generation boundary (LLM request filtering)

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

| System         | What It Provides                    | How Used                |
| -------------- | ----------------------------------- | ----------------------- |
| NSFW           | Content rating, encounter mechanics | Moderation gating       |
| Character Core | NSFW content rating                 | Content filtering       |
| Shared Schemas | ConsentState, NSFWContentRating     | Enforcement contracts   |
| Plugin System  | Moderation plugin hooks             | Custom moderation rules |

### Systems That Depend On This Epic

| System         | What It Consumes  | How Used                  |
| -------------- | ----------------- | ------------------------- |
| NSFW           | Moderation state  | Enable/disable encounters |
| Chat Lifecycle | NSFW toggle       | Chat context management   |
| Analytics      | Moderation events | Safety dashboard          |

### Cross-System Events

| Event                       | Direction  | Purpose                                 |
| --------------------------- | ---------- | --------------------------------------- |
| `nsfw.toggle`               | emits      | Enable/disable NSFW for chat/user/world |
| `nsfw.content.flagged`      | emits      | Trigger moderation queue                |
| `nsfw.content.moderated`    | emits      | Update content visibility               |
| `moderation.action.applied` | emits      | Audit trail, analytics                  |
| `consent.revoked`           | subscribes | Disable NSFW encounters                 |
