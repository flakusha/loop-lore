<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: backlog — schedule Chat Variants Taxonomy cluster (RPG / character-group / LLM-only-GM)

**Status:** Done
**Status Note:** Shipped 2026-10-22 — the cluster's four members (rpg, rpg-group, character-group, llm-only-group-gm) are implemented; the taxonomy ships as the canonical `VARIANT_DEFAULTS` table, every variant is selectable in the new-chat form, and the entry-point tab branching remains as cross-cutting work on the parent epic.
**Priority:** medium
**Effort:** Medium
**Type:** Task
**Summary:** The 4-ticket RPG/character-group chat-variants cluster tracks per-variant implementation under epic-chat-variants-taxonomy.md (column mapping onto chats.chat_type/chat_mode/chat_purpose, no schema migration). This ticket captures the batch as parent tracker.
**Context:** Per epic-chat-variants-taxonomy.md (Status: Done — the taxonomy shipped and the members below are implemented), variant 8 (llm-only + gm, no world) vs variant 12 (rpg group, world, no required gm) overlap is called out as the open boundary question. Members below are all Done (verified 2026-10-22) and carry Epic: epic-chat-variants-taxonomy. This parent is filed under epic-group-chat per batch assignment; canonical taxonomy home remains epic-chat-variants-taxonomy.md (see Related).
**Epic:** epic-group-chat

## Issues in scope

| Ticket | Topic | Status (2026-10-22) | Epic |
| --- | --- | --- | --- |
| TASK-chat-variant-rpg.md | RPG 1x1 variant | Done | epic-chat-variants-taxonomy |
| TASK-chat-variant-rpg-group.md | RPG group variant | Done | epic-chat-variants-taxonomy |
| TASK-chat-variant-character-group.md | Character group variant | Done | epic-chat-variants-taxonomy |
| TASK-chat-variant-llm-only-group-gm.md | LLM-only group + GM variant | Done | epic-chat-variants-taxonomy |

**Acceptance Criteria:**

- [x] Parentage established: each of the 4 member tickets linked to this parent (body or comment).
- [x] No member left without Epic link (all 4 carry Epic: epic-chat-variants-taxonomy; verified 2026-10-22).
- [x] index.json updated via plan:sync:fix; no duplicate epic created.
- [x] Variant 8 vs 12 (llm-only-gm vs rpg-group) boundary question recorded against epic-chat-variants-taxonomy.md.

**Tags:** chat, taxonomy, chat-variants, rpg, group-chat, gm
**Related:** .plan/epics/epic-chat-variants-taxonomy.md, .plan/epics/epic-group-chat.md


git issue: TBD

git issue: 409f599

**Resolved:** 2026-10-22 registry-driven close: git issue 409f599 (registry tip: 0b7c140a3 Konstantin Fedotov Auto-closed: appended .md marker marks TASK-BACKLOG-CHAT-VARIANTS-TAXON)
