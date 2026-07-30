# TASK: Import/Export & Data Portability

**Status:** ✅ Implemented (updated 2026-07-30)
**Priority:** Medium
**Effort:** Low (remaining work only)
**Epic:** epic-import-export-io

## Summary

Character and chat import/export system. Core fully implemented — auto-detection, 6 normalizers, 5 exporters, PNG steganography, CHARX bundles, 4 chat export formats.

## Completed

- [x] Auto-detection (PNG/ZIP/JSON/TOML/YAML)
- [x] Normalizers: CCv2, CCv3, Character.AI, JSON flat, TOML, YAML
- [x] Exporters: CCv2, CCv3, PNG, YAML, TOML
- [x] PNG steganography (read + write + CRC32)
- [x] CHARX extraction + creation
- [x] Import route (`src/routes/import.ts`)
- [x] Export route (`src/routes/export.ts`)
- [x] Chat export: Markdown, JSON, HTML, plain text
- [x] Frontend modals (import + export)
- [x] Lorebook import with character cards (2026-07-30)

## Remaining

- [x] Lorebook export round-trip fidelity → `TASK-lorebook-export.md`
- [ ] URL import from Chub.ai → `TASK-url-import-chub.md` (v2)
- [ ] CLI commands → `TASK-cli-import-export.md` (v2)

## Linked Epics

- `epic-import-export-io.md`

## Acceptance Criteria

- [x] All character formats parse correctly
- [x] Export produces valid CCv2/CCv3/PNG/YAML/TOML
- [x] PNG round-trip works (insert → extract)
- [x] CHARX bundles work (create → extract)
- [x] Chat export in all 4 formats
- [x] Lorebook import (character_book entries → actor_lore_entries)

## Implementation Notes

Lorebook import added to `src/routes/import.ts`:

- `importLorebook()` function maps `LorebookData` → `actor_lore_entries` table
- Handles field mapping: keys (string[] → JSON), enabled (boolean → enum), case_sensitive/selective/constant (boolean → 0/1)
- Continues import on individual entry failures (warns but doesn't abort)
- Returns count of imported entries in response
- Tests: `src/routes/import.test.ts` (3 tests covering creation, disabled entries, cascade delete)
