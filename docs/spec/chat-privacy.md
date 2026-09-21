<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Chat Privacy Specification

> **Status:** Design — mostly NOT implemented (the previous "Final" banner overstated). Authoritative source: `src/`; progress is tracked in the epic.

## Design model (intent)

- **Privacy** (who can see messages): `public | private | world | location | group` — orthogonal to purpose and to context-inclusion.
- **Purpose** (what feeds the LLM): `main | side | notes` included; `coordination` (player-to-player OOC/strategy) NEVER feeds the LLM.
- **Steering notes** (admin/gm/assistant/system roles): role-gated visibility, injected into context; categories general/world/character/story/combat/session.
- **Access roles** master > gm > member > observer > anonymous; retention permanent; deletion restricted (master/gm/world-owner by level); anonymous public-chat visitors read-only.

## Implemented

- `chats.purpose` column (nullable text, no enum enforcement) — `src/db/schema-core.ts`.
- `chats.encryption_level` (`none|standard|private`; default out-of-enum `"public"`, not enforced by the pipeline — epic Known Issue) — `src/db/schema-manifest.ts`.
- Per-chat encryption keys — `src/crypto/` (see `docs/spec/encryption-workflow.md`).
- GM steering notes shipped via the separate whitenotes/shadow-notes system — `src/routes/gm-notes/` (see `docs/spec/gm-shadow-notes.md`); this is NOT the spec's `steering_notes` table.

## Not implemented / aspirational

- `ChatPrivacy` enum + `chats.privacy` column; `ChatPurpose` enum wiring; coordination exclusion from generation context; `chat_participants.role` (master/gm/member/observer/anonymous); privacy/purpose chat-list filtering; `steering_notes` table + `/api/chats/:chatId/notes` CRUD; retention enforcement; per-privacy character-data visibility matrix (inventory/relationships/memories/stats hidden in public chats); permission-matrix enforcement (`src/chat/privacy.ts` and siblings absent).

## Epics

- `.plan/epics/epic-chat-privacy.md` — implementation state + acceptance criteria (source of truth for progress).
- `.plan/epics/epic-chat-lifecycle-moderation.md` — moderation surface; `.plan/epics/epic-auth-access.md` — RBAC; `.plan/epics/epic-chat-transfer-location.md` — location-scoped privacy.
