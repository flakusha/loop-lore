# TASK-2026-046: Character Template Seeding

**Status**: open
**Priority**: medium
**Labels**: feature, characters, config
**Assignee**:
**Epic**: EPIC-059 (Creative Studio)
**Related**: configs/characters/*.yaml, src/config/character-loader.ts

## Description

Character templates are automatically seeded on app start from `configs/characters/` directory. Supports both single-character and multi-character files in YAML/TOML. Built-in defaults provide 6 starter characters. Hard IDs enable deterministic test reseeding.

### Acceptance Criteria

- [x] Add `configs/characters/` directory loader
- [x] Create `src/config/character-loader.ts` with `loadCharacterFiles()`
- [x] Add character template config to `TemplatesConfig`
- [x] Merge built-in defaults with user character files
- [x] Support hard IDs for test reseeding
- [x] Add access control fields (visibility, content_rating, target_roles)
- [x] Create example character files in YAML and TOML
- [ ] Add unit tests for character loader
- [ ] Add integration test for seeding flow

### Notes

Files:

- `src/config/character-loader.ts` — Character file loader
- `src/config/templates-loader.ts` — Integrated character loading
- `src/config/sections/characters.ts` — Built-in defaults
- `src/characters/seed.ts` — Seeder with merge logic
- `src/server.ts` — Startup integration

Example formats:

- `configs/characters/elara-nightwhisper.yaml` — Single character, folded strings
- `configs/characters/group-fantasy-scifi.yaml` — Multi-character
- `configs/characters/elara-nightwhisper.toml` — TOML format
- `configs/templates/character.example.yaml` — Template documentation
