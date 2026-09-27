<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Actors — SillyTavern Import + V2 Export

**Status:** Done
**Priority:** medium
**Effort:** Medium
**Epic:** epic-actors
**Summary:** SillyTavern character-card V1/V2 parser, inverse V2 export, and `/api/actors/import` + `/api/actors/:id/export` routes. Cards round-trip: V2 import → export reproduces the same JSON shape (modulo internal-only fields).
**Context:** gap-audit 2026-09-25 of `epic-actors` found no SillyTavern V1/V2 parser. V2 wraps V1 fields plus `extensions` JSON; map V2 onto internal columns and preserve unmapped fields in `settings` JSON column.
**Acceptance Criteria:** V1 parser handles legacy fields (`name`, `description`, `personality`, `scenario`, `first_mes`, `mes_example`); V2 parser extracts `data` + `extensions`, maps known extensions to typed columns, preserves unknown extensions in `settings.extensions`; export produces a card loadable by SillyTavern (round-trip verified); import + export are lossless for documented V2 schema; malformed inputs return 400 with structured error (not 500); `bun run check` green.

## Summary

SillyTavern character-card V1/V2 parser, the inverse V2 export path, and the `/api/actors/import` + `/api/actors/:id/export` routes. Cards round-trip: a V2 import followed by an export reproduces the same JSON shape (modulo our internal-only fields).

## Background

`epic-actors` calls for SillyTavern V1/V2 import parsers and a V2 export format. The V2 spec (`chara_card_v2`) wraps V1 fields plus an `extensions` JSON blob; we map V2 onto internal columns and preserve unmapped fields in our `settings` JSON column. The export path produces a valid V2 card from any internal actor row.

## Scope

- `src/import/sillytavern-v1.ts` (new) — `parseV1Card(json): ParsedActorPayload`.
- `src/import/sillytavern-v2.ts` (new) — `parseV2Card(json): ParsedActorPayload` (delegates to V1 parser for the embedded V1 blob).
- `src/export/sillytavern-v2.ts` (new) — `exportV2Card(actor: ActorRow): V2CardJson`.
- `src/routes/actors-import.ts` (new) — `POST /api/actors/import` accepting a card JSON payload, returning the new actor id.
- `src/routes/actors-export.ts` (new) — `GET /api/actors/:id/export?format=v2` returning the V2 card.
- `src/import/__tests__/roundtrip.test.ts` — V2 card → import → export → deep-equal V2 card.
- Unit tests for malformed inputs (missing V2 wrapper, invalid extensions, etc.).

## Acceptance Criteria

- [ ] V1 parser handles legacy fields (`name`, `description`, `personality`, `scenario`, `first_mes`, `mes_example`).
- [ ] V2 parser extracts `data` + `extensions`, maps known extensions to typed columns, preserves unknown extensions in `settings.extensions`.
- [ ] Export produces a card loadable by SillyTavern (round-trip verified).
- [ ] Import + Export are lossless for the documented V2 schema.
- [ ] Malformed inputs return 400 with a structured error, not a 500.
- [ ] `bun run check` green.

## Linked Tickets

- Companion tickets (this epic): `TASK-actors-data-versioning.md`, `TASK-actors-child-tables-crud.md`, `TASK-actors-api-routes.md`.
- Related: `docs/spec/actors.md` (authoritative spec), `epic-character-core-system.md`.


git issue: 9fd4c89
