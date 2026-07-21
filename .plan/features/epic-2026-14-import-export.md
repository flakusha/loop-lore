# Epic 2026-14: Import/Export & Data Portability

**Status:** ✅ Complete (reconciled 2026-07-19)
**Priority:** —
**Source:** docs/meta/epic-14-plan.md, docs/meta/backlog.md

## Summary

Character card multi-format import (CCv2/CCv3/CHARX/PNG), chat export, bulk export. **Already implemented.**

## Linked Tasks

| Task                                        | Title                        | Priority | Status      |
| ------------------------------------------- | ---------------------------- | -------- | ----------- |
| TASK-epic14-import-export-reconciliation.md | Import/Export reconciliation | —        | ✅ Complete |

## Implementation Phases

### Phase 1: Core Import

- [x] Auto-detection algorithm
- [x] CCv2 normalizer
- [x] CCv3 normalizer
- [x] Character.AI normalizer
- [x] YAML/TOML character import

### Phase 2: PNG + CHARX

- [x] PNG chunk writer
- [x] V3 PNG support
- [x] CHARX extraction
- [x] CHARX export

### Phase 3: Export

- [x] YAML exporter
- [x] TOML exporter
- [x] PNG exporter (dual chunks)
- [x] Bulk ZIP export

### Phase 4: Chat Export

- [x] HTML chat export
- [x] Plain text chat export
- [x] Chat export with assets

## Files

- `src/routes/import.ts` — Import endpoint
- `src/routes/chat-export.ts` — Chat export
- `src/routes/export.ts` — Bulk export
- `src/characters/parser.ts` — Auto-detection
- `src/characters/normalizers/*.ts` — Format normalizers
- `src/characters/exporters/*.ts` — Format exporters
- `src/characters/steganography.ts` — PNG read/write
- `src/characters/charx.ts` — CHARX format
