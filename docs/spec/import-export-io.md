<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Import/Export & I/O Specification

> **Status:** Expanded 2026-10-02 from an auto-generated STUB. Grounded in `src/` (authoritative).
> Owner epic `.plan/epics/epic-import-export-io.md` is **Done** (2026-07-30 code audit:
> "Core system fully implemented").

## Overview

Character, chat, and world import/export and data portability — auto-detection, format normalizers,
exporters, PNG steganography, CHARX bundles, and whole-world export.

## Scope

Shipped:

- **Character import:** `src/routes/import/` (actor, lorebook, handle) and
  `src/characters/importers/character-systems/` (availability, avatars, licensing, mood,
  relationships, traits, world-setup).
- **Character export:** `src/characters/exporters/` — `ccv2.ts`, `ccv3.ts`, `png.ts`, `toml.ts`,
  `yaml.ts`, `character-systems.ts`, `shared.ts`.
- **Character systems HTTP I/O:** `src/routes/character-io/` (`import.ts`, `export.ts`) — the
  `/api/actors/:actorId/systems/{import,export}` endpoints.
- **Bundles + steganography:** `src/characters/charx.ts`, `src/characters/steganography.ts`,
  `src/characters/steganography-png.ts`.
- **Whole-world export:** `src/routes/export-shared/` (characters, chats, worlds, locations, story,
  assets, finalize) with SSE job progress in `src/routes/export-sse/` (start, jobs, status,
  download).
- **World import:** `src/routes/world-import/` (`bundle.ts`, `rows.ts`, `routes.ts`).
- **Chat export:** `src/chat/export/formats.ts`.

## Technical Design

- Auto-detection and format normalizers live in `src/characters/parser.ts` +
  `src/characters/normalizers/` (`ccv2`, `ccv3`, `character-ai`, `json-flat`, `toml`, `yaml`);
  `src/routes/import/handle.ts` calls `parseCharacterCard()` and `actor.ts` calls
  `validateCharacter()`.
- PNG steganography embeds/reads card data via `src/characters/steganography-png.ts`.
- CHARX bundle handling lives in `src/characters/charx.ts`.
- World export streams progress over SSE (`src/routes/export-sse/`).

## Integration Points

- `src/characters/` — parser, exporters, steganography.
- `src/routes/export-shared/` + `src/routes/export-sse/` — export pipeline (shared payloads +
  streaming jobs).
- `src/routes/world-import/` — world bundle import.
- Schema foundation: `.plan/epics/epic-schema.md` — `format_version` per row; migrations stay
  additive.

## Related Epics

- `.plan/epics/epic-import-export-io.md` — owner (Done)
- `.plan/epics/epic-schema.md`
- `.plan/epics/epic-io-formats.md` — hollow stub ("TBD"), superseded by `epic-import-export-io.md`
