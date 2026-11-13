<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Exclude coordination-purpose chats from LLM context assembly

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Epic:** epic-chat-privacy
**Tags:** chat-privacy, prompt-assembly

**Summary:**

`chats.purpose` EXISTS (`src/db/schema-core.ts:721`) and is persisted on create (`src/chat/service/crud/create.ts:43,232`) — but it is NEVER read. `src/assistant/prompt-assembler.ts:143-176` selects no `purpose` column, so chats marked coordination still feed the LLM. The privacy epic (epic-chat-privacy.md) carries the acceptance criterion "coordination excluded from LLM context" with a "not implemented" premise; the reality is worse than that premise — the column is implemented and persisted, just never consulted at assembly time.

Scope (narrow): the prompt assembler excludes coordination-purpose chats/messages from the assembled prompt. Assert on assembler input: a purpose=coordination chat contributes no message to the assembled prompt; normal chats are unaffected. Read the column where the assembler already reads the chat row — no new table, no migration, no new API.

OUT (follow-ups, not this ticket): the wider privacy epic surface (`steering_notes`, `chat_participants.role`, encryption tiers) — separate tickets.

**Caveats:** TOCTOU: purpose is read at assembly time; a purpose change mid-assembly applies to the next assembly. Security: exclusion is deny-by-purpose — unknown purposes still feed context; only `coordination` is excluded. Authorization: unchanged — this is context hygiene, not access control. Parallelism: assembler is per-request; no shared state. Partial failure: a missing purpose value behaves as today (included), never a crash. Rollback: removing the filter restores prior assembly. Observability: excluded chats are countable at the assembler call site.

**Context:**

Why the assembler and not the query layer: the defect is a column written but never read at the single point where context is built. Filtering at the assembler fixes every caller at once; per-call-site filters would leave the next caller broken.

**Acceptance Criteria:**

- [ ] A purpose=coordination chat contributes no message to the assembled prompt (assert on assembler input).
- [ ] Normal chats (main/side/notes) are unaffected.
- [ ] No schema change, no migration, no new endpoint.

**Related:** epic-chat-privacy.md
