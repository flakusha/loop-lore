# docs/ & .plan/ Analysis, Deduplication & Task Proposals

**Generated:** 2026-07-28
**Scope:** All markdown files under `docs/` and `.plan/`, plus the cross-mechanics integration matrix, backlog, review-topics, and immediate plan.

---

## 1. Deduplication Summary

### 1.1 Overlapping Documents (Consolidated)

The following information exists in 2+ places across docs/ and .plan/. Each should be consolidated into a single source of truth.

| Topic                  | docs/spec/                                            | .plan/epics/                                    | .plan/tickets/                    | .plan/backlog.md | .plan/cross-mechanics-integration-matrix.md | Status                                                                                                            |
| ---------------------- | ----------------------------------------------------- | ----------------------------------------------- | --------------------------------- | ---------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Character system**   | `character-spec.md` (supersedes `character-setup.md`) | `epic-character-core-system.md` (draft)         | 12 tickets (TASK-character-*)     | ✅ Listed in P2  | Partial                                     | **Consolidate**: character-setup.md is dead weight; delete or archive it.                                         |
| **Chat lifecycle**     | —                                                     | `epic-chat-lifecycle-moderation.md`             | TASK-chat-lifecycle-moderation.md | ✅ Listed in P2  | —                                           | Aligned                                                                                                           |
| **RPG mechanics**      | `rpg-mechanics.md` (aspirational, no code)            | `epic-rpg-mechanics.md`                         | 8+ TASK-rpg-*                     | ✅ Listed in P2  | ✅ Cross-ref'd                              | **Gap**: no spec linked in .plan/epics.md for this spec                                                           |
| **Memory system**      | `memory-system.md`                                    | —                                               | TASK-memory-*                     | ✅ Listed in P2  | —                                           | **Gap**: no epic file exists; only tickets                                                                        |
| **Encryption**         | `encryption-workflow.md`                              | `epic-encryption-foundation-aes-256-gcm.md`     | TASK-encryption-*                 | ✅ Listed in P1  | —                                           | Aligned                                                                                                           |
| **Assets/media**       | `assets.md`                                           | —                                               | TASK-asset-*                      | ✅ Listed in P2  | —                                           | **Gap**: no epic; assets spec stops at compression step 6 (no content analysis)                                   |
| **Plugin system**      | `plugin-system.md`                                    | `epic-plugin-system.md`                         | TASK-plugin-*                     | ✅ Listed in P2  | —                                           | Aligned                                                                                                           |
| **Item system**        | `items.md`, `inventory.md`                            | `epic-item-system-extensions.md`                | TASK-item-system-extensions.md    | ✅ Listed in P2  | —                                           | **Gap**: items.md and inventory.md exist as specs but have no linked epic; epic-extensions doesn't reference them |
| **Social interaction** | `social-interaction.md` (draft)                       | `epic-social-interaction.md`                    | TASK-social-interaction.md        | ✅ Listed in P2  | ✅ Cross-ref'd                              | **Gap**: social-interaction.md is still "draft, not implemented"                                                  |
| **NPCs**               | `npcs.md`                                             | No NPC epic exists                              | No NPC tickets                    | ✅ Listed in P2  | ✅ Cross-ref'd                              | **Major gap**: npcs.md spec exists but no epic or tickets back it                                                 |
| **Worlds**             | `worlds.md` (draft)                                   | `epic-world-locations.md` (oversized, 8 phases) | TASK-world-*                      | ✅ Listed in P2  | ✅ Cross-ref'd                              | Epic needs splitting per review-topics recommendation                                                             |
| **Multi-session**      | `users-sessions.md`                                   | `epic-multi-session.md`                         | TASK-multi-session-*              | ✅ Listed in P2  | —                                           | Aligned                                                                                                           |
| **Admin visibility**   | —                                                     | —                                               | —                                 | —                | —                                           | **New**: covered by research agent (epics 54-58) but not yet in .plan/                                            |

### 1.2 Stale/Orphaned Files

| File                           | Issue                                                                       | Recommendation                                              |
| ------------------------------ | --------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `docs/spec/character-setup.md` | Superseded by `character-spec.md` but still linked in epic references       | Archive or delete                                           |
| `docs/spec/character-setup.md` | Still referenced from `epic-character-core-system.md` "References" section  | Update reference to point to character-spec.md              |
| `docs/meta/plan.md`            | References epics that have been renamed/restructured                        | Update to match current epic filenames                      |
| `.plan/tickets/index.json`     | Some entries have no linked epic file                                       | Clean up orphan entries                                     |
| `.plan/epics.md` (in .plan/)   | Old consolidated file; `docs/meta/epics.md` is now the auto-generated index | Deprecate `.plan/epics.md` in favor of `docs/meta/epics.md` |

### 1.3 Conflicting Information

| Topic                     | docs/ says                                               | .plan/ says                                                                               | Resolution                                                                                                                   |
| ------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Epic numbering**        | `docs/meta/plan.md` uses sequential numbers (Epic 10-51) | `.plan/epics.md` lists epics as "New Epics (from docs reconciliation)" with numbers 32-52 | `.plan/epics.md` is the working document; `docs/meta/plan.md` is canonical source — they diverge on which epics are "active" |
| **Character spec status** | `character-spec.md` is comprehensive                     | `epic-character-core-system.md` is "📝 Draft" with 0 tasks                                | The spec exists but has no implementation epic tasks — need to create TASK-* tickets                                         |
| **NPCs**                  | `docs/spec/npcs.md` exists (comprehensive)               | No NPC epic, no NPC tickets                                                               | Spec exists but plan is empty — this is a gap, not a conflict                                                                |
| **Items**                 | `docs/spec/items.md` and `docs/spec/inventory.md` exist  | `epic-item-system-extensions.md` covers extensions only                                   | Two separate concerns: base items spec vs extensions epic — this is correct separation                                       |

### 1.4 Deduplication Actions

1. **Delete** `docs/spec/character-setup.md` (superseded by character-spec.md)
2. **Update** all references to `character-setup.md` → `character-spec.md`
3. **Deprecate** `.plan/epics.md` — it duplicates `docs/meta/epics.md` which is auto-generated via `bun run docs:gen`
4. **Remove** duplicate backlog entries that are already covered in `.plan/immediate.md`
5. **Consolidate** the cross-mechanics matrix gaps (G1-G17) into actionable tickets in `.plan/backlog.md` and `.plan/epics/`

---

