# Epic 2026-14: Import/Export & Data Portability

**Status:** Not Started (P1-High)
**Priority:** Medium
**Source:** docs/meta/epic-14-plan.md, docs/meta/backlog.md

## Summary

Character card multi-format import (CCv2/CCv3/CHARX/PNG), chat export, bulk export.

## Linked Tasks

| Task | Title | Priority | Status |
| ---- | ----- | -------- | ------ |
| FEAT-2026-001 | Multi-format character import (PNG/YAML/TOML/CHARX) | Low | Not Started |
| TASK-epic14-import-export-reconciliation.md | Import/Export reconciliation | Medium | Not Started |

## Implementation Phases

### Phase 1: Core Import
- [ ] Auto-detection algorithm
- [ ] CCv2 normalizer
- [ ] CCv3 normalizer
- [ ] Character.AI normalizer
- [ ] YAML/TOML character import

### Phase 2: PNG + CHARX
- [ ] PNG chunk writer
- [ ] V3 PNG support
- [ ] CHARX extraction
- [ ] CHARX export

### Phase 3: Export
- [ ] YAML exporter
- [ ] TOML exporter
- [ ] PNG exporter (dual chunks)
- [ ] Bulk ZIP export

### Phase 4: Chat Export
- [ ] HTML chat export
- [ ] Plain text chat export
- [ ] Chat export with assets

## Files

- `src/routes/import.ts` — Import endpoint
- `src/routes/chat-export.ts` — Chat export
- `src/routes/export.ts` — Bulk export
- `src/characters/parser.ts` — Auto-detection
- `src/characters/normalizers/*.ts` — Format normalizers
- `src/characters/exporters/*.ts` — Format exporters
- `src/characters/steganography.ts` — PNG read/write
- `src/characters/charx.ts` — CHARX format
