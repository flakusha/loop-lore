<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: I/O Formats

**Effort:** Medium
**Type:** epic
**Tags:** (none)
**Overview:** (see sections below)


**Status:** Not Started
**Status Note:** Not Started
**Priority:** Medium

## Summary

Canonical on-the-wire formats for data portability between loop-lore and external systems (SillyTavern, RisuAI, Character.AI, plain JSON exports). Covers character cards, lorebooks, world bundles, chat archives, and asset manifests — with version negotiation and forward/backward compatibility baked into each format.

**Context:** `epic-import-export-io.md` already shipped a partial implementation (SillyTavern V1/V2 character cards). This epic generalizes the pattern across all data shapes so that future exports/imports (RisuAI, Character.AI, world bundles) share the same codec + version handshake. The 2026-09-23 docs-vs-plan audit (`epic-docs-vs-plan-gap-audit-2026-09-19.md`) flagged the lack of a unified `format_version` convention across formats; this epic introduces it.

## Scope

### Formats

- **Character card** — `chara_card_v1`, `chara_card_v2`, `chara_card_v3` (SillyTavern spec; loop-lore ext)
- **Lorebook** — SillyTavern lorebook JSON + RisuAI's `risu_lsm` (lazy-stored memory)
- **World bundle** — loop-lore native (`.llworld` — `worlds.json` + `locations/` + `npcs/` + `assets/` zip)
- **Chat archive** — loop-lore native (`.llchat`) and SillyTavern JSONL
- **Asset manifest** — content-hash-addressed (`blake3`) reference list

### Codec

- One codec per format in `src/io/codecs/{character-card,lorebook,world-bundle,chat-archive,asset-manifest}.ts`
- Common `format_version` header (integer, monotonic per format) + `producer` (`loop-lore/<semver>`) + `created_at`
- Forward compatible: readers MUST accept `format_version <= reader_version`; writers MUST produce the **minimum** version their content needs.
- Tests in `src/io/__tests__/codec-roundtrip.test.ts` for every (writer-version, reader-version) pair up to N-1.

### Format handshake

```typescript
interface FormatHeader {
  format: "character-card" | "lorebook" | "world-bundle" | "chat-archive" | "asset-manifest";
  format_version: number;
  producer: string;            // e.g. "loop-lore/0.1.0"
  producer_version: string;    // semver
  created_at: string;          // ISO-8601
  content_hash?: string;       // blake3 of payload
}
```

### Out of scope

- Streaming import of multi-GB world bundles (chunked import is `epic-import-export-io.md` follow-up).
- Differential sync (handled by `epic-federation-swarm-sync.md`).

## Acceptance Criteria

- [ ] All five formats have a typed header (`FormatHeader`) and codec in `src/io/codecs/`.
- [ ] Roundtrip tests pass for every format at every supported version pair.
- [ ] Producer-side lint rejects formats emitted at higher version than `package.json` declares.
- [ ] Reader-side rejects formats with `format_version > reader_max` with stable `error_code: "io.unsupported_format_version"`.
- [ ] Migration guide added to `docs/spec/io-formats.md` covering v1→v2→v3 character-card evolution.

## Related Epics

- `docs/spec/io-formats.md`
- `epic-import-export-io.md` — partial implementation; this epic generalizes
- `epic-actors.md` — character card import lands in actor tables
- `epic-content-hashing-distributed-integrity.md` — content_hash is blake3

## Tickets

