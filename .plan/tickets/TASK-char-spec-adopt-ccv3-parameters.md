<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-char-spec-adopt-ccv3-parameters

**Status**: open
**Priority**: medium
**Labels**: character-spec, import-export, spec-compliance, schema
**Assignee**:
**Epic**: epic-character-core-system
**Related**: `docs/spec/character-spec.md`, `docs/spec/io-formats.md` §1.2, `src/characters/spec/`

## Description

Character Card V3 (RisuAI standard) defines fields not present in loop-lore's
canonical character model. These are either silently dropped on import or
never supported at all:

| CCv3 Field | Current Status | Gap |
|---|---|---|
| `creation_date` | Not stored | No provenance tracking |
| `modification_date` | Not stored | No edit timeline |
| `assets` (embedded) | Via `asset_links` | V3 `embeded://` URIs lost on import |
| `character_book.entries[].use_regex` | Not supported | Regex triggers in lorebook entries |
| Decorator system (`@@depth N`, `@@role`) | Not supported | Rich lorebook formatting |
| `visibility` (Character.AI) | Not stored | Public/unlisted/private |

### Acceptance Criteria

- [ ] `creation_date` and `modification_date` stored on actor record (nullable timestamps)
- [ ] V3 `assets` embedded URIs normalized to `asset_links` references on import
- [ ] `use_regex` flag preserved in lorebook entry schema
- [ ] Decorator directives (`@@depth`, `@@role`) parsed and stored in entry metadata
- [ ] `visibility` enum added to character model: `public | unlisted | private`
- [ ] Import normalizers (CCv2, CCv3, Character.AI) updated to extract these fields
- [ ] Export normalizers emit these fields in appropriate formats
- [ ] DB migration for new columns on `actors` and `lorebook_entries` tables
- [ ] `db:sync-types` + `db:sync-manifest` regenerated
- [ ] Config example files document new character properties

### Notes

- CCv3 `nickname` already mapped — no gap
- CCv3 `first_mes` → `welcome_message` already mapped
- Decorator system needs parser: `@@depth 3` → `{ decorator: "depth", value: "3" }`
- Character.AI `definition` field already parsed for macros, but `visibility` is new
- The unified spec (BasedInn) also defines `group_chat_settings` — defer to separate task
