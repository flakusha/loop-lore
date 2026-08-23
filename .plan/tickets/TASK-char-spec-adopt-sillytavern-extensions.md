<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-char-spec-adopt-sillytavern-extensions

**Status**: open
**Priority**: medium
**Labels**: character-spec, import-export, spec-compliance, schema
**Assignee**:
**Epic**: epic-character-core-system
**Related**: `docs/spec/character-spec.md` §1.3, §7, `docs/spec/io-formats.md` §1.1

## Description

SillyTavern/Chub CCv2 cards include `data.extensions` with platform-specific
nested data that loop-lore currently ignores. Key extension namespaces:

| Extension Key | Content | Used By |
|---|---|---|
| `risu` | Emotion expressions (mood → URL mappings) | RisuAI |
| `chub` | Full description, NSFW toggle | Chub.ai |
| `depth_prompt` | Per-depth prompt overrides | SillyTavern |
| `talkativeness` | Response length preference | SillyTavern |
| `fav` | Favorited status | SillyTavern |
| `world` | World book reference | SillyTavern |
| `expressions` | Emotion expression images | Agnai |

These extensions contain data that maps to loop-lore concepts:
- `risu.expressions` → Emotion avatars (already implemented as separate system)
- `depth_prompt` → Per-context-length system prompt overrides
- `talkativeness` → Response length configuration
- `fav` → User bookmarking

### Acceptance Criteria

- [ ] Extension namespace registry: define which namespaces loop-lore consumes
- [ ] `risu.expressions` imported into `character_emotion_avatars` table
- [ ] `depth_prompt` stored as `depth_prompts` JSON on actor record (prompt per depth)
- [ ] `talkativeness` stored as `response_style` preference on actor record
- [ ] `fav` stored as `bookmarked` boolean (per-user, per-character)
- [ ] `chub.full_path` / `chub.tavern_personality` merged into description on import
- [ ] Unknown extension namespaces preserved as-is in `extensions` JSON blob
- [ ] Extension namespace registry is config-driven (YAML/TOML config)
- [ ] Import normalizers extract known extensions; preserve unknown ones
- [ ] Export normalizers emit consumed extensions in appropriate format
- [ ] Config example files document supported extension namespaces

### Notes

- The `extensions` field on `CanonicalCharacter` already exists as `Record<string, unknown>`
- SillyTavern uses `data.extensions` while loop-lore uses top-level `extensions` — normalize on import
- RisuAI emotion expressions map to loop-lore's emotion avatar system but are URL-based vs asset-based
- `depth_prompt` is per-depth, not per-purpose — different from loop-lore's `systemPrompts.purposes`
