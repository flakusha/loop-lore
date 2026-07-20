# Epic 2026-28: Asset Support Expansion

**Status:** Not Started (P2)
**Priority:** Medium
**Source:** docs/spec/assets.md + RPG/Business usage requirements

## Summary

Expand asset system beyond images/audio/video to include RPG-specific assets (tokens, maps, item cards), business documents (PDFs, spreadsheets), 3D models, video cutscenes, and asset versioning.

## Linked Tasks

| Task | Title | Priority | Status |
| ---- | ----- | -------- | ------ |
| FEAT-2026-004 | Artifact system (code/docs/datasets as assets) | High | Not Started |
| FEAT-2026-031 | Procedural Asset Pipelines Implementation | Medium | Not Started |
| TASK-asset-rpg-tokens.md | RPG token and map assets | Medium | Not Started |
| TASK-asset-3d-models.md | 3D model support | Low | Not Started |
| TASK-asset-versioning.md | Asset versioning system | Medium | Not Started |
| TASK-asset-templates.md | Asset templates and presets | Low | Not Started |
| TASK-asset-storage-compression.md | Asset storage compression and encryption | Medium | Not Started |

## Asset Types by Domain

### RPG Assets

| Asset Type | Label | Use Case |
| ---------- | ----- | -------- |
| `rpg_token` | `token` | Character/token for battle maps |
| `rpg_map` | `battlemap` | Battle map/grid overlay |
| `rpg_item_card` | `item_card` | Item/equipment visualization |
| `rpg_spell_icon` | `spell_icon` | Spell/ability icons |
| `rpg_condition` | `condition_marker` | Status effect markers |
| `rpg_handout` | `handout` | Player handouts, lore sheets |

### Business Assets

| Asset Type | MIME | Use Case |
| ---------- | ---- | -------- |
| `business_pdf` | application/pdf | Reports, contracts, presentations |
| `business_spreadsheet` | application/vnd.openxmlformats-officedocument.spreadsheetml.sheet | Data sheets, budgets |
| `business_presentation` | application/vnd.openxmlformats-officedocument.presentationml.presentation | Slides, decks |
| `business_document` | application/vnd.openxmlformats-officedocument.wordprocessingml.document | Docs, letters |

### 3D Assets

| Asset Type | Format | Use Case |
| ---------- | ------ | -------- |
| `model_3d` | gltf/glb | Character/avatar models |
| `environment_3d` | gltf/glb | World environments |
| `prop_3d` | gltf/glb | Interactive objects |

### Video Assets

| Asset Type | Label | Use Case |
| ---------- | ----- | -------- |
| `video_cutscene` | `cutscene` | Story cutscenes |
| `video_npc` | `npc_intro` | NPC introduction videos |
| `video_lore` | `lore_video` | World lore videos |

## Implementation Phases

### Phase 0: Storage Foundation (Current → Future)
- [x] Flat filesystem storage (UUID-derived paths) — current default
- [ ] Encryption-at-rest (AES-256-GCM) — mandatory for sensitive assets
- [ ] Compression pipeline (gzip/zstd/brotli) — for compressible data
- [ ] Object store backend (S3/GCS) — configurable via env vars

### Phase 1: Document Support (PDF/Business)
- [ ] PDF preview/thumbnail generation
- [ ] Spreadsheet metadata extraction
- [ ] Document thumbnail service
- [ ] Asset type extension for business docs

### Phase 2: RPG Asset Types
- [ ] Token grid overlay system
- [ ] Battle map grid computation
- [ ] Item card template renderer
- [ ] Spell icon sprite sheet support

### Phase 3: 3D Model Support
- [ ] GLTF/GLB validation and metadata
- [ ] 3D preview thumbnail generation
- [ ] Model optimization pipeline
- [ ] Environment lighting presets

### Phase 4: Asset Versioning
- [ ] Version table schema (asset_versions)
- [ ] Upload creates new version
- [ ] Version selector UI
- [ ] Rollback capability

### Phase 5: Templates & Presets
- [ ] Asset template CRUD
- [ ] Template-based generation
- [ ] Preset dimensions/styles
- [ ] Community template sharing

## Files

- `src/assets/service.ts` — Extended for versioning
- `src/assets/controller.ts` — Extended for new types
- `src/assets/metadata.ts` — PDF/3D metadata
- `src/assets/templates.ts` — Template system
- `src/assets/storage/backend.ts` — Storage abstraction
- `src/assets/storage/encrypted.ts` — Encryption wrapper
- `src/assets/storage/compressed.ts` — Compression wrapper
- `src/db/schema-assets.ts` — Versioning tables
- `src/frontend/components/asset-preview.html` — Extended previews
- `src/frontend/components/asset-version-modal.html` — Version UI