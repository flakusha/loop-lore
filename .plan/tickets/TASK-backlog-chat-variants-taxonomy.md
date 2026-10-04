<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: backlog — schedule Chat Variants Taxonomy cluster (RPG / character-group / LLM-only-GM)

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Type:** Task
**Summary:** The 4-ticket RPG/character-group chat-variants cluster tracks per-variant implementation under epic-chat-variants-taxonomy.md (column mapping onto chats.chat_type/chat_mode/chat_purpose, no schema migration). This ticket captures the batch as parent tracker.
**Context:** Per epic-chat-variants-taxonomy.md (Status: Not Started, taxonomy agreed, column mapping established, per-variant implementation open), variant 8 (llm-only + gm, no world) vs variant 12 (rpg group, world, no required gm) overlap is called out as the open boundary question. Members below are all Not Started (verified 2026-10-02) and already carry Epic: epic-chat-variants-taxonomy. This parent is filed under epic-group-chat per batch assignment; canonical taxonomy home remains epic-chat-variants-taxonomy.md (see Related).
**Epic:** epic-group-chat

## Issues in scope

| Ticket | Topic | Status (2026-10-02) | Epic |
| --- | --- | --- | --- |
| TASK-chat-variant-rpg.md | RPG 1x1 variant | Not Started | epic-chat-variants-taxonomy |
| TASK-chat-variant-rpg-group.md | RPG group variant | Not Started | epic-chat-variants-taxonomy |
| TASK-chat-variant-character-group.md | Character group variant | Not Started | epic-chat-variants-taxonomy |
| TASK-chat-variant-llm-only-group-gm.md | LLM-only group + GM variant | Not Started | epic-chat-variants-taxonomy |

**Acceptance Criteria:**

- [ ] Parentage established: each of the 4 member tickets linked to this parent (body or comment).
- [ ] No member left without Epic link (all 4 already carry Epic: epic-chat-variants-taxonomy; verified 2026-10-02).
- [ ] index.json updated via plan:sync:fix; no duplicate epic created.
- [ ] Variant 8 vs 12 (llm-only-gm vs rpg-group) boundary question recorded against epic-chat-variants-taxonomy.md.

**Tags:** chat, taxonomy, chat-variants, rpg, group-chat, gm
**Related:** .plan/epics/epic-chat-variants-taxonomy.md, .plan/epics/epic-group-chat.md


git issue: TBD