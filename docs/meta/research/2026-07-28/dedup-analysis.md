# docs/ & .plan/ Analysis, Deduplication & Task Proposals

**Generated:** 2026-07-28
**Scope:** All markdown files under `docs/` and `.plan/`, plus the cross-mechanics integration matrix, backlog, review-topics, and immediate plan.

---

## 1. Deduplication Summary

### 1.1 Overlapping Documents (Consolidated)

The following information exists in 2+ places across docs/ and .plan/. Each should be consolidated into a single source of truth.

| Topic | docs/spec/ | .plan/epics/ | .plan/tickets/ | .plan/backlog.md | .plan/cross-mechanics-integration-matrix.md | Status |
|---|---|---|---|---|---|---|
| **Character system** | `character-spec.md` (supersedes `character-setup.md`) | `epic-character-core-system.md` (draft) | 12 tickets (TASK-character-*) | ✅ Listed in P2 | Partial | **Consolidate**: character-setup.md is dead weight; delete or archive it. |
| **Chat lifecycle** | — | `epic-chat-lifecycle-moderation.md` | TASK-chat-lifecycle-moderation.md | ✅ Listed in P2 | — | Aligned |
| **RPG mechanics** | `rpg-mechanics.md` (aspirational, no code) | `epic-rpg-mechanics.md` | 8+ TASK-rpg-* | ✅ Listed in P2 | ✅ Cross-ref'd | **Gap**: no spec linked in .plan/epics.md for this spec |
| **Memory system** | `memory-system.md` | — | TASK-memory-* | ✅ Listed in P2 | — | **Gap**: no epic file exists; only tickets |
| **Encryption** | `encryption-workflow.md` | `epic-encryption-foundation-aes-256-gcm.md` | TASK-encryption-* | ✅ Listed in P1 | — | Aligned |
| **Assets/media** | `assets.md` | — | TASK-asset-* | ✅ Listed in P2 | — | **Gap**: no epic; assets spec stops at compression step 6 (no content analysis) |
| **Plugin system** | `plugin-system.md` | `epic-plugin-system.md` | TASK-plugin-* | ✅ Listed in P2 | — | Aligned |
| **Item system** | `items.md`, `inventory.md` | `epic-item-system-extensions.md` | TASK-item-system-extensions.md | ✅ Listed in P2 | — | **Gap**: items.md and inventory.md exist as specs but have no linked epic; epic-extensions doesn't reference them |
| **Social interaction** | `social-interaction.md` (draft) | `epic-social-interaction.md` | TASK-social-interaction.md | ✅ Listed in P2 | ✅ Cross-ref'd | **Gap**: social-interaction.md is still "draft, not implemented" |
| **NPCs** | `npcs.md` | No NPC epic exists | No NPC tickets | ✅ Listed in P2 | ✅ Cross-ref'd | **Major gap**: npcs.md spec exists but no epic or tickets back it |
| **Worlds** | `worlds.md` (draft) | `epic-world-locations.md` (oversized, 8 phases) | TASK-world-* | ✅ Listed in P2 | ✅ Cross-ref'd | Epic needs splitting per review-topics recommendation |
| **Multi-session** | `users-sessions.md` | `epic-multi-session.md` | TASK-multi-session-* | ✅ Listed in P2 | — | Aligned |
| **Admin visibility** | — | — | — | — | — | **New**: covered by research agent (epics 54-58) but not yet in .plan/ |

### 1.2 Stale/Orphaned Files

| File | Issue | Recommendation |
|---|---|---|
| `docs/spec/character-setup.md` | Superseded by `character-spec.md` but still linked in epic references | Archive or delete |
| `docs/spec/character-setup.md` | Still referenced from `epic-character-core-system.md` "References" section | Update reference to point to character-spec.md |
| `docs/meta/plan.md` | References epics that have been renamed/restructured | Update to match current epic filenames |
| `.plan/tickets/index.json` | Some entries have no linked epic file | Clean up orphan entries |
| `.plan/epics.md` (in .plan/) | Old consolidated file; `docs/meta/epics.md` is now the auto-generated index | Deprecate `.plan/epics.md` in favor of `docs/meta/epics.md` |

### 1.3 Conflicting Information

| Topic | docs/ says | .plan/ says | Resolution |
|---|---|---|---|
| **Epic numbering** | `docs/meta/plan.md` uses sequential numbers (Epic 10-51) | `.plan/epics.md` lists epics as "New Epics (from docs reconciliation)" with numbers 32-52 | `.plan/epics.md` is the working document; `docs/meta/plan.md` is canonical source — they diverge on which epics are "active" |
| **Character spec status** | `character-spec.md` is comprehensive | `epic-character-core-system.md` is "📝 Draft" with 0 tasks | The spec exists but has no implementation epic tasks — need to create TASK-* tickets |
| **NPCs** | `docs/spec/npcs.md` exists (comprehensive) | No NPC epic, no NPC tickets | Spec exists but plan is empty — this is a gap, not a conflict |
| **Items** | `docs/spec/items.md` and `docs/spec/inventory.md` exist | `epic-item-system-extensions.md` covers extensions only | Two separate concerns: base items spec vs extensions epic — this is correct separation |

### 1.4 Deduplication Actions

1. **Delete** `docs/spec/character-setup.md` (superseded by character-spec.md)
2. **Update** all references to `character-setup.md` → `character-spec.md`
3. **Deprecate** `.plan/epics.md` — it duplicates `docs/meta/epics.md` which is auto-generated via `bun run docs:gen`
4. **Remove** duplicate backlog entries that are already covered in `.plan/immediate.md`
5. **Consolidate** the cross-mechanics matrix gaps (G1-G17) into actionable tickets — see §2 below

---

## 2. Proposed New Tasks

Based on the gaps identified across docs/ and .plan/, the following tasks are proposed:

### 2.1 Critical Gaps (missing specs with no plan coverage)

| Task ID | Title | Type | Rationale | Linked Epic |
|---|---|---|---|---|
| `TASK-npc-epic` | Create NPC epic (epic-npcs.md) | Epic creation | `docs/spec/npcs.md` exists but has zero plan coverage | New epic |
| `TASK-npc-behavior` | NPC behavior state machine | Ticket | NPC behavior is underspecified in npcs.md | TASK-npc-epic |
| `TASK-npc-memory` | NPC memory lifecycle & decay | Ticket | No NPC memory spec for decay/sharing | TASK-npc-epic |
| `TASK-npc-inventory` | NPC inventory & trading | Ticket | Mentioned in world-locations but never specified | TASK-npc-epic |
| `TASK-world-spec` | Create worlds.md spec | Spec creation | worlds.md is still "draft, not implemented" | epic-world-locations |
| `TASK-world-persistence` | World persistence model | Ticket | No persistence spec (save frequency, conflict resolution) | epic-world-locations |
| `TASK-social-spec` | Create social-interaction.md spec | Spec creation | social-interaction.md exists as draft, needs completion | epic-social-interaction |
| `TASK-social-npc-interactions` | NPC-to-NPC social dynamics | Ticket | No spec covers NPC-to-NPC interaction | TASK-social-spec |
| `TASK-item-spec` | Create items.md spec | Spec creation | items.md exists but is disconnected from epic | New epic |
| `TASK-inventory-spec` | Create inventory.md spec | Spec creation | inventory.md exists but has no linked epic | New epic |
| `TASK-attachment-moderation` | Create attachment-moderation.md spec + review queue | Spec + code | Assets spec stops at compression; no content analysis pipeline | Assets epic |
| `TASK-content-analysis-pipeline` | Wire auto-caption + image moderation into upload pipeline | Code | `/caption` exists but is manual-only; no auto-trigger | TASK-attachment-moderation |
| `TASK-thumbnail-generation` | Add thumbnail_path column + WebP thumbnail generation | Code + migration | Spec says step 6 is thumbnails but no code implements it | TASK-attachment-moderation |

### 2.2 Cross-Mechanics Gaps (from integration matrix)

| Gap ID | Systems | Recommended Ticket |
|---|---|---|
| G1 | Battle ↔ Items | `TASK-battle-item-integration` — equipment affects stats, loot → inventory |
| G2 | Battle ↔ Social | `TASK-battle-social-checks` — intimidation, morale, surrender |
| G3 | Battle ↔ NPC/Actor | `TASK-battle-npc-ai` — personality-driven enemy AI |
| G4 | Battle ↔ Weather/Terrain | `TASK-battle-environment` — environmental combat modifiers |
| G5 | Resolution ↔ All combat/social/magic | `TASK-resolution-integration` — unified dice resolution |
| G6 | NSFW ↔ Housing | `TASK-nsfw-housing` — private spaces with comfort bonuses |
| G7 | NSFW ↔ Weather | `TASK-nsfw-weather` — weather affects encounter mood |
| G8 | NSFW ↔ Social | `TASK-nsfw-social` — social skills as seduction prerequisites |
| G9 | NSFW ↔ Disease | `TASK-nsfw-disease` — reproductive health in disease system |
| G10 | Housing ↔ Companion | `TASK-housing-companion` — companion housing, pet rooms |
| G11 | Crafting ↔ Magic | `TASK-crafting-enchanting` — enchanting as cross-system feature |

### 2.3 Structural Improvements

| Task ID | Title | Type | Rationale |
|---|---|---|---|
| `TASK-dedup-character-setup` | Delete stale character-setup.md | Cleanup | Superseded spec still linked in epic |
| `TASK-dedup-epics-md` | Deprecate .plan/epics.md in favor of docs/meta/epics.md | Cleanup | Duplicate of auto-generated index |
| `TASK-dedu-plan-index` | Rebuild .plan/tickets/index.json from actual ticket files | Maintenance | Stale entries with missing epic links |
| `TASK-split-world-locations` | Split epic-world-locations.md into 4 sub-epics | Epic restructuring | Epic explicitly says "too large to ship in one pass" |
| `TASK-split-battle` | Split epic-battle-action-systems.md into 5 sub-epics | Epic restructuring | Epic is oversized (20 tasks) |
| `TASK-link-specs-to-epics` | Add cross-references from all specs to their linked epics | Documentation | Many specs exist with no epic link |
| `TASK-link-epics-to-specs` | Add specs section to all epics that reference external specs | Documentation | Epics reference specs that don't exist (npcs.md, inventory.md, battle.md) |

### 2.4 Missing Specs (create from scratch)

| Spec File | Rationale |
|---|---|
| `docs/spec/npcs.md` | Already exists but needs completion — should be a full spec |
| `docs/spec/items.md` | Already exists as standalone spec, needs epic linkage |
| `docs/spec/inventory.md` | Already exists as standalone spec, needs epic linkage |
| `docs/spec/battle.md` | Referenced by multiple epics but doesn't exist |
| `docs/spec/chat-privacy.md` | Referenced by backlog but only linked from access-model-clarification.md |
| `docs/spec/attachment-moderation.md` | Content analysis review queue is entirely missing |
| `docs/spec/character-migration.md` | Migration paths mentioned in character-spec but not documented |
| `docs/spec/licensing.md` | CC0 and admin management mentioned but no legal-grade spec |
| `docs/spec/character-interactions.md` | Impersonation rules exist but interaction mechanics don't |

---

## 3. Next Steps (Execution Plan)

### Phase 1: Cleanup (immediate, low effort)

1. **Delete** `docs/spec/character-setup.md` (confirmed superseded by character-spec.md)
2. **Update** all references to character-setup.md → character-spec.md (grep for it)
3. **Deprecate** `.plan/epics.md` — add a `DEPRECATED` header pointing to `docs/meta/epics.md`
4. **Rebuild** `.plan/tickets/index.json` — run the sync-ticket-index script to fix orphan entries

### Phase 2: Close Critical Spec Gaps (1-2 sprints)

5. **Create** `docs/spec/npcs.md` — NPC data model, behavior system, memory, interaction patterns (reference the existing npcs.md in docs/spec/ — it may already be close to complete)
6. **Create** `docs/spec/battle.md` — combat flow, dice resolution, initiative, action economy
7. **Create** `docs/spec/chat-privacy.md` — access model, visibility rules, who sees what
8. **Create** `docs/spec/attachment-moderation.md` — review queue, approve/reject workflow
9. **Finalize** `docs/spec/social-interaction.md` — currently marked draft, needs spec completion
10. **Finalize** `docs/spec/worlds.md` — currently marked draft, needs spec completion

### Phase 3: Cross-Mechanics Integration Tickets (ongoing)

11. **Create** tickets G1-G11 from the integration matrix for Battle↔Items, Battle↔Social, Battle↔Weather, etc.
12. **Add** Integration Points sections to all oversized epics (world-locations, battle-action, etc.)
13. **Create** `epic-npcs.md` — dedicated NPC epic with phased implementation
14. **Create** `epic-inventory.md` — inventory management epic
15. **Create** `epic-items.md` — base items epic (separate from item-system-extensions)

### Phase 4: Structural Reconciliation

16. **Split** `epic-world-locations.md` into 4 sub-epics (as the epic itself proposes)
17. **Split** `epic-battle-action-systems.md` into 5 sub-epics
18. **Add** specs cross-reference section to every epic file
19. **Add** epic cross-reference section to every spec file
20. **Update** `docs/meta/review-topics.md` with completed items after each phase

### Phase 5: Verification

21. **Run** `bun run check` — typecheck + lint + format + md lint
22. **Run** `bun test src/` — unit tests
23. **Run** `scripts/sync-ticket-index.ts` — verify index.json is consistent
24. **Run** `bun run docs:gen` — regenerate `docs/meta/epics.md` from .plan/epics/
25. **Commit** all cleanup and new task files

---

## 4. Key Metrics

| Metric | Count |
|---|---|
| Total spec files (docs/spec/) | ~65 files |
| Total epic files (.plan/epics/) | ~78 files |
| Total ticket files (.plan/tickets/) | ~300+ files (including FEAT-* and TASK-* variants) |
| Stale/dead spec files | 1 (character-setup.md) |
| Specs with no linked epic | ~8 (npcs, items, inventory, battle, chat-privacy, attachment-moderation, character-migration, licensing) |
| Epics with no linked spec | ~6 (NPCs, Inventory, Items, Battle) |
| Cross-mechanics gaps (unresolved) | 11 (G1-G11) |
| Oversized epics needing split | 2 (world-locations, battle-action) |
| Deduplication targets | 3 (character-setup.md, .plan/epics.md, index.json) |

---

## 5. Risks & Edge Cases

- **character-setup.md deletion**: Must verify no other files reference it besides the epic and plan.md before deleting. Check with `grep -r "character-setup" .`.
- **TASK-npc-epic creation**: The existing `docs/spec/npcs.md` may already be partially implemented — need to verify what code exists under `src/` related to NPCs before creating the epic.
- **epic-world-locations.md split**: This epic is very large (8 phases, ~100 interfaces). Splitting it will create 4 new files and require updating all cross-references from other epics and specs.
- **.plan/epics.md deprecation**: The auto-generated `docs/meta/epics.md` is the source of truth. Deprecating `.plan/epics.md` means any tooling that reads it needs updating.
- **index.json rebuild**: The sync-ticket-index script (`scripts/sync-ticket-index.ts`) may need updates to handle the new task format.

---

## 6. Quick-Start for Any Team Member

```bash
# 1. Clean up stale files
rm docs/spec/character-setup.md
grep -r "character-setup" . --include="*.md"  # verify no remaining refs

# 2. Rebuild ticket index
bun run scripts/sync-ticket-index.ts

# 3. Regenerate auto-generated epic index
bun run docs:gen

# 4. Run checks
bun run check
```

---

*Analysis based on `docs/meta/review-topics.md` (2026-07-27), `.plan/cross-mechanics-integration-matrix.md` (2026-07-27), `.plan/backlog.md`, `.plan/immediate.md`, `.plan/epics.md`, and directory traversal of `docs/` and `.plan/`.*
