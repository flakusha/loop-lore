<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-char-editor-import-export-ui

**Status**: open
**Priority**: high
**Labels**: frontend, character-editor, import-export, ux
**Assignee**:
**Epic**: epic-character-core-system
**Related**: `docs/spec/character-spec.md` §4, `docs/spec/io-formats.md`, `src/partials/characters/import-modal.html`, `src/partials/characters/export-modal.html`

## Description

Import and export modals exist (`import-modal.html`, `export-modal.html`) but
don't implement the full format pipeline specified in the IO formats spec.

**Current state**:
- Import modal: file upload, unknown format support
- Export modal: exists as partial, unknown if wired

**Spec-defined capabilities missing**:
- Format auto-detection (CCv2, CCv3, Character.AI, PNG, CHARX, YAML, TOML)
- Import from URL (`POST /api/characters/import/url`)
- CHARX async import with progress polling (202 → job status)
- PNG embedded card import (chunk extraction)
- Multi-format export (JSON, YAML, TOML, PNG, CHARX)
- Export format selector with preview
- Import error handling with field-level suggestions
- Batch import (multiple files, bulk creation)

### Acceptance Criteria

- [ ] Import modal: file drop zone + file picker + URL import tab
- [ ] Auto-detect format on file select, show detected format badge
- [ ] Preview parsed character data before confirming import
- [ ] Import validation: show field-level errors with suggestions before creating
- [ ] CHARX import: show progress bar, poll job status, show result
- [ ] PNG import: extract and show embedded card + preview avatar image
- [ ] Import from URL: paste URL, fetch, parse, preview, confirm
- [ ] Export modal: format selector (JSON | YAML | TOML | PNG | CHARX)
- [ ] Export preview: show formatted output before download
- [ ] Export includes all character data (traits, mood, NSFW, extensions)
- [ ] Export format round-trip: export → re-import produces identical character
- [ ] Batch import: multi-file select, show summary (N imported, M failed, K skipped)
- [ ] Error handling: per-file error display with suggestions
- [ ] Drag-and-drop support for file import (desktop)
- [ ] Unit test: format detection, preview rendering, error display

### Notes

- Import/export endpoints already partially exist in `src/routes/character-io/` and `src/routes/import/actor.ts`
- `jszip` dependency needed for CHARX extraction (not yet in package.json)
- PNG chunk parsing uses native Bun APIs (`Bun.readableStreamToBlob()`)
- The `import-modal.html` and `export-modal.html` partials exist — extend, don't replace
- Multi-format export reuses the raw editor's format conversion logic
