<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-char-editor-raw-json-yaml-toml-editor

**Status**: open
**Priority**: medium
**Labels**: frontend, character-editor, ux, import-export
**Assignee**:
**Epic**: epic-character-core-system
**Related**: `docs/spec/character-spec.md` §4.2, §10, `docs/spec/io-formats.md` §1.6-1.7

## Description

The character spec designates YAML, TOML, and JSON as first-class formats.
Currently the only edit surface is the flat HTML form — no raw text editor
exists for power users who want to author characters in YAML/TOML/JSON with
syntax validation, auto-formatting, and instant preview.

### Acceptance Criteria

- [ ] Raw editor tab on character edit form: "Raw" alongside Basic Info | Traits | etc.
- [ ] Format selector: JSON | YAML | TOML — switches the textarea content and validation
- [ ] Textarea with monospace font, line numbers, and syntax error highlighting
- [ ] On format change: convert current form state to selected format
- [ ] On raw edit: parse and validate against canonical schema, show inline errors
- [ ] "Apply" button: parse raw text, validate, populate all structured form tabs
- [ ] "Format" button: pretty-print current raw text (preserves comments in YAML)
- [ ] Format detection: paste any format → auto-detect and parse
- [ ] Unsaved changes warning when switching away from raw tab with edits
- [ ] Character card preview: JSON Schema from `/schemas/character-card.json` loaded for validation
- [ ] Import modal reuses raw editor for paste-import flow
- [ ] Export modal reuses raw editor for preview-before-download
- [ ] CodeMirror 6 or Monaco (bundle-size conscious) for syntax highlighting
- [ ] Unit test: format conversion round-trip, validation error display

### Notes

- `js-yaml` already in deps; `smol-toml` removed — use `Bun.TOML` or import small lib
- YAML format must preserve comments on format → edit → re-format round-trip
- TOML sections map to `[character]`, `[character.prompts]`, `[character.greetings]`
- JSON Schema at `/schemas/character-card.json` is specified but may not exist yet
- The raw editor is the fallback when structured editor can't express a field (e.g. unknown extensions)
- Consider: CodeMirror 6 is ~200KB gzipped but has YAML/TOML modes; Monaco is ~5MB
