# Epic 14: Import/Export & Data Portability

**Status:** ✅ Implemented (updated 2026-07-30 — code audit)
**Priority:** Medium
**Effort:** ~~High~~ Low (remaining work)
**Type:** Feature Epic
**Tags:** import, export, characters, steganography, io-formats

## Summary

Character and chat import/export system — auto-detection, format normalizers, exporters, PNG steganography, CHARX bundles, and chat export. **Core system fully implemented.**

## Reference

- Spec: `docs/spec/io-formats.md`
- Spec: `docs/spec/character-spec.md`

## Current State (Code Audit)

### ✅ Implemented — Import

| Component                               | File                                                | Status  |
| --------------------------------------- | --------------------------------------------------- | ------- |
| Auto-detection (PNG/ZIP/JSON/TOML/YAML) | `src/characters/parser.ts` (191L)                   | ✅ Done |
| CCv2 normalizer                         | `src/characters/normalizers/ccv2.ts` + test         | ✅ Done |
| CCv3 normalizer                         | `src/characters/normalizers/ccv3.ts` + test         | ✅ Done |
| Character.AI normalizer                 | `src/characters/normalizers/character-ai.ts` + test | ✅ Done |
| JSON flat normalizer                    | `src/characters/normalizers/json-flat.ts` + test    | ✅ Done |
| TOML normalizer                         | `src/characters/normalizers/toml.ts` + test         | ✅ Done |
| YAML normalizer                         | `src/characters/normalizers/yaml.ts` + test         | ✅ Done |
| Import route                            | `src/routes/import.ts` (274L)                       | ✅ Done |
| Character validation                    | `src/characters/validator.ts`                       | ✅ Done |

### ✅ Implemented — Export

| Component                  | File                               | Status  |
| -------------------------- | ---------------------------------- | ------- |
| CCv2 exporter              | `src/characters/exporters/ccv2.ts` | ✅ Done |
| CCv3 exporter              | `src/characters/exporters/ccv3.ts` | ✅ Done |
| PNG exporter (dual chunks) | `src/characters/exporters/png.ts`  | ✅ Done |
| YAML exporter              | `src/characters/exporters/yaml.ts` | ✅ Done |
| TOML exporter              | `src/characters/exporters/toml.ts` | ✅ Done |
| Export route               | `src/routes/export.ts` (292L)      | ✅ Done |
| Export SSE stream          | `src/routes/export-sse.ts`         | ✅ Done |

### ✅ Implemented — PNG Steganography

| Component              | File                                     | Status  |
| ---------------------- | ---------------------------------------- | ------- |
| PNG extraction         | `src/characters/steganography.ts` (243L) | ✅ Done |
| PNG insertion (writer) | `src/characters/steganography.ts`        | ✅ Done |
| CRC32 checksum         | `src/characters/steganography.ts`        | ✅ Done |
| Tests                  | `src/characters/steganography.test.ts`   | ✅ Done |

### ✅ Implemented — CHARX Bundles

| Component               | File                            | Status  |
| ----------------------- | ------------------------------- | ------- |
| CHARX extraction        | `src/characters/charx.ts` (96L) | ✅ Done |
| CHARX creation (export) | `src/characters/charx.ts`       | ✅ Done |
| Embedded URI resolution | `src/characters/charx.ts`       | ✅ Done |

### ✅ Implemented — Chat Export

| Component         | File                               | Status  |
| ----------------- | ---------------------------------- | ------- |
| Markdown export   | `src/routes/chat-export.ts` (323L) | ✅ Done |
| JSON export       | `src/routes/chat-export.ts`        | ✅ Done |
| HTML export       | `src/routes/chat-export.ts`        | ✅ Done |
| Plain text export | `src/routes/chat-export.ts`        | ✅ Done |
| Tests             | `src/routes/chat-export.test.ts`   | ✅ Done |

### ✅ Implemented — Supporting

| Component                 | File                                            | Status  |
| ------------------------- | ----------------------------------------------- | ------- |
| Canonical character model | `src/characters/spec.ts` (421L)                 | ✅ Done |
| Error types               | `src/characters/errors.ts` (183L)               | ✅ Done |
| Exporter index            | `src/characters/exporters/index.ts`             | ✅ Done |
| Normalizer index          | `src/characters/normalizers/index.ts`           | ✅ Done |
| Character-systems bridge  | `src/characters/importers/character-systems.ts` | ✅ Done |
| Frontend import modal     | `src/partials/characters/import-modal.html`     | ✅ Done |
| Frontend export modal     | `src/partials/characters/export-modal.html`     | ✅ Done |

## Remaining Work (if any)

- [x] Lorebook import with characters (implemented 2026-07-30)
- [x] Lorebook export round-trip fidelity → `TASK-lorebook-export.md`
- [ ] URL import from Chub.ai → `TASK-url-import-chub.md` (deferred to v2)
- [ ] CLI commands → `TASK-cli-import-export.md` (deferred to v2)
- [ ] Bulk ZIP export (verify — route exists but scope unclear)

## Tasks

- [x] Auto-detection algorithm
- [x] CCv2/CCv3/Character.AI/JSON/TOML/YAML normalizers
- [x] Import route with all formats
- [x] PNG steganography (read + write)
- [x] CHARX extraction + export
- [x] All exporters (CCv2, CCv3, PNG, YAML, TOML)
- [x] Export route
- [x] Lorebook import with character cards
- [x] Chat export (Markdown, JSON, HTML, plain text)

## Files

- `src/characters/` — full character I/O system (parser, normalizers, exporters, steganography, charx)
- `src/routes/import.ts` — import API
- `src/routes/export.ts` — export API
- `src/routes/chat-export.ts` — chat export API
- `src/routes/export-sse.ts` — SSE streaming export

## Related Epics

- `epic-actors.md` — imported characters become actors
- `epic-archival-workflow.md` — export interacts with archival
- `epic-plugin-system.md` — potential plugin-based format support

## Tickets

- `TASK-import-export-io.md` — implementation tasks (STUB — needs update)
