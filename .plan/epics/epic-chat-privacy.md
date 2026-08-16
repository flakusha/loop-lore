<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Epic: Chat Privacy

**Status:** 📝 Draft — spec Final (`docs/spec/chat-privacy.md`); partial implementation (GM notes, chat `public` flag); privacy/purpose columns + steering-notes API not implemented
**Priority:** Medium
**Effort:** Medium
**Type:** Feature Epic
**Tags:** chat, privacy, encryption, moderation, access-control

## Overview

Chat privacy specification — covers message encryption, access control, privacy settings, and moderation hooks for chat interactions. Spec: `docs/spec/chat-privacy.md` (Final, authoritative).

## Reference

- Spec: `docs/spec/chat-privacy.md`
- Related: `docs/spec/encryption-workflow.md`, `docs/spec/auth-middleware.md`

## Chat Privacy Systems

### Core Privacy Model

```typescript
enum ChatPrivacy {
  Public = "public", // Anyone can discover and join
  Private = "private", // Only invited participants
  World = "world", // Any user in the same world
  Location = "location", // Any user at the same location
  Group = "group", // A defined group of participants
}

enum ChatPurpose {
  Main = "main", // Primary story/roleplay — feeds LLM context
  Side = "side", // Side conversations — included in context
  Notes = "notes", // Steering notes — included in context for guidance
  Coordination = "coordination", // Player-to-player OOC — NEVER feeds LLM
}
```

### Message Access Control

```typescript
interface MessageAccessControl {
  canRead: (userId: string, chat: ChatPrivacy) => boolean;
  canWrite: (userId: string, chat: ChatPrivacy) => boolean;
  canExport: (userId: string, chat: ChatPrivacy) => boolean;
  canDelete: (userId: string, chat: ChatPrivacy) => boolean;
}
```

### Privacy Policy

```typescript
interface PrivacyPolicy {
  retention: Record<ChatPrivacy, "permanent" | "ttl">;
  exportable: Record<ChatPrivacy, boolean>;
  deletable: Record<ChatPrivacy, "master" | "gm" | "world_owner" | "none">;
}
```

### Moderation Hook

```typescript
interface ModerationHook {
  onFlag: (messageId: string, reason: string, reporterId: string) => Promise<void>;
  onReview: (flagId: string, decision: "keep" | "delete" | "dismiss") => Promise<void>;
}
```

### Steering Notes

```typescript
enum SteeringNoteRole {
  Admin = "admin", // Server admin notes — visible to admins only
  GM = "gm", // Game master notes — visible to GMs and admins
  Assistant = "assistant", // AI assistant internal notes — visible to admins
  System = "system", // System-generated notes — visible to admins
}
```

## Implementation State (2026-08-16)

| Component                     | Status                                                                                       | Location                              |
| ----------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------- |
| GM notes (shadow/whitenotes)  | ✅ Shipped                                                                                   | `src/routes/gm-notes/`                |
| Chat `public` flag            | ✅ Migration 038/039 (`chats.public`)                                                        | `src/db/migrations/038*.ts`           |
| `chats.purpose` column        | ✅ Column exists (nullable)                                                                  | `schema-core.ts:423`                  |
| `ChatPrivacy` enum + column   | ❌ Not implemented — spec only                                                               | —                                     |
| `steering_notes` table + API  | ❌ Not implemented — spec only                                                               | —                                     |
| Chat list privacy filtering   | ❌ Not implemented (`ChatListQuery.privacy/purpose`)                                         | —                                     |
| Participant roles (master/gm) | ❌ Not implemented (`chat_participants.role`)                                                | —                                     |
| Encryption at rest/in transit | ✅ Per-chat encryption keys + key-mgmt UI (see `epic-crypto` / `epic-encryption-workflow`)   | `src/crypto/`                         |

## Acceptance Criteria

- [x] GM/assistant steering notes (shadow/whitenotes) — implemented
- [x] Chat `public` flag + per-chat encryption keys — implemented
- [ ] `ChatPrivacy` enum + `chats.privacy` column (public/private/world/location/group)
- [ ] `ChatPurpose` enum + `chats.purpose` column wired (coordination excluded from LLM context)
- [ ] `steering_notes` table + CRUD API (`/api/chats/:chatId/notes`)
- [ ] Participant roles (`chat_participants.role`: master/gm/member/observer/anonymous)
- [ ] Chat list filtering by privacy/purpose
- [ ] Message visibility rules per privacy level (incl. character data matrix)
- [ ] Access control per chat/room (read/write/export/delete matrix)
- [ ] Privacy settings configurable per user
- [ ] Moderation hooks functional (flag/review/retention)

## Related Epics

- `epic-chat-lifecycle-moderation.md` — moderation surface (blocks, bans, shadowing, flags)
- `epic-crypto.md` / `epic-encryption-workflow.md` — at-rest encryption
- `epic-auth-access.md` — role-based access control
- `epic-chat-transfer-location.md` — location-scoped chat privacy