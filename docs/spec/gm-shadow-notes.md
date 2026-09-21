<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Actor Notes & GM Shadow Notes Specification

> **Status:** Partially implemented — per-actor notes have base CRUD only; GM whitenotes/shadow notes have CRUD + prompt injection shipped (the epic's "injection pending" note is stale). Authoritative source: `src/`.

## Implemented

- **Per-actor notes** (`actor_notes`: id, actor_id, title, content, category, pinned, sort_order, timestamps) with generic CRUD + `?category=` filter, pinned-first ordering — `src/routes/actor-notes.ts` (mounted `src/app/register-plugins.ts:162`); schema `src/db/schema-manifest.ts`.
- **GM whitenotes + shadow notes** (chat-scoped): tables `src/db/schema-gm.ts`; CRUD `src/routes/gm-notes/` (whitenotes.ts, shadow.ts; mounted `register-plugins.ts:205`); GM panel UI `src/components/chat/gm-panel.html` + `src/frontend/alpine/gm-panel.ts`.
- **Prompt injection (shipped)** — `gmNotesSection` renders active whitenotes (type/priority/scope) + unrevealed shadow notes into the system prompt; expired whitenotes filtered at assembly; revealed shadow notes excluded — `src/assistant/prompt/sections/gm-notes.ts`, registered in `src/assistant/prompt/registry.ts`, tested in `sections/gm-notes.test.ts`.
- **Shadow-note hardening migrations** — `visibility` LLM-injection gate (002), `expires_at` TTL + `author_type` (004) — `src/db/migrations/`.

## Not implemented / aspirational

- `actor_notes` TTL extension (visibility / ttl_messages / ttl_remaining / status / scope / author_type columns) — still proposed; the table has base columns only.
- Message-count TTL semantics: per-context defaults (1x1 = 10 messages, group = 5/3 turns, story = per-turn), category modifiers (combat −2, lore +5, relationships +3, reminders −3, floor 1), batch expiry sweep, expiry notifications (toast / system-message / silent).
- Unified search across notes + memories + lore (`GET /api/actors/:actorId/search`, `SearchableItemType` manifest, plugin registration) — not present.
- Dev-mode full-injected-context debug panel, message debug API, and `/api/dev/notes/trace` — not present.
- Design principles worth keeping: notes are intentional authored directives vs organic `actor_memories`; notes expire by default (TTL) with pinned as the exception; injection order world → shadow → notes → memories → history.

## Epics

- `.plan/epics/epic-gm-shadow-notes.md` — whitenote/shadow-note epic (its status line still says "prompt injection pending"; `src/assistant/prompt/sections/gm-notes.ts` + registry + tests show it shipped).
- Related: `.plan/epics/epic-chat-lifecycle-moderation.md`, `.plan/epics/epic-assistant-generation-extensions.md`.
