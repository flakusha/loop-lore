<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

> High-level notes — may drift from implementation. Authoritative source is `src/` and AGENTS.md.

# IO Formats — Import/Export Specifications

Status: Implemented (core — epic code audit 2026-07-30). Deferred: Chub URL import, CLI commands.

## Implemented

- Import — auto-detection (PNG/ZIP/JSON/TOML/YAML) in `src/characters/parser.ts` (`parseCharacterCard`); normalizers for CCv2, CCv3, Character.AI, JSON-flat, TOML, YAML in `src/characters/normalizers/`; import routes `src/routes/import/` (file, PNG-avatar, CHARX) and `src/routes/character-io/import.ts` (systems data, incl. from URL).
- Export — CCv2/CCv3/PNG/YAML/TOML exporters in `src/characters/exporters/`; PNG steganography in `src/characters/steganography.ts` (+ `steganography-png.ts`); CHARX bundles in `src/characters/charx.ts`; error taxonomy in `src/characters/errors.ts`.
- Chat export — `GET /api/chats/:id/export?format=markdown|json|html|text` (`src/routes/chat-export/`).
- Bulk export — `POST /api/export` returns a ZIP with manifest + sha256 checksums (`src/routes/export.ts`); async jobs with SSE progress/status/download (`src/routes/export-sse/`).

## Format notes (compressed unique detail)

- Formats: CCv2 (`chara_card_v2`), CCv3 (adds `nickname`, embedded assets, timestamps, per-entry `use_regex`), Character.AI export (`definition` appended to description; `{{char}}`/`{{user}}` macros preserved), PNG-embedded, CHARX (ZIP: `card.json` + `assets/<type>/...`, `embeded://` URIs), native YAML (hand-authoring) and TOML (programmatic generation).
- Canonical renames: `first_mes` → `welcome_message`; `character_book` → `lorebook`.
- PNG tEXt chunks: V1 `Chara`, V2 `chara`, V3 `ccv3` — base64 JSON; read preference ccv3 → chara → Chara; write `chara` + `ccv3` for frontend compatibility.
- Detection order: PNG chunks → ZIP (CHARX) → JSON `spec` field → Character.AI `definition` → flat JSON → TOML → YAML.
- Import errors: `FORMAT_NOT_DETECTED`, `PARSE_ERROR`, `VALIDATION_ERROR`, `UNSUPPORTED_VERSION`.

## Not implemented / aspirational

- URL import from Chub.ai (`TASK-url-import-chub.md`, deferred to v2); CLI import/export commands (`TASK-cli-import-export.md`).

## Epics

- `.plan/epics/epic-import-export-io.md` — owner; per-component implementation tables and status.
- `.plan/epics/epic-io-formats.md` — hollow stub ("TBD"), superseded by the above.

Upstream specs: github.com/malfoyslastname/character-card-spec-v2 · github.com/kwaroran/character-card-spec-v3
