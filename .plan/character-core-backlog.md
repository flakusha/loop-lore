# Character Core System — Backlog

**Created:** 2026-07-23
**Branch:** feat-character-improvements
**Commits:** 5075200, 44542f4, dc8dec5

---

## ✅ Completed

| # | Feature | Files | Status |
|---|---------|-------|--------|
| 1 | **Enums** — ContentRating, LicenseType, TraitCategory, WorldTraitCategory, RelationshipType, AvatarTagType, etc. | `src/db/enums-character.ts` | ✅ Done |
| 2 | **Migration** — 14 new tables + content_rating on actors | `src/db/migrations/025_character_systems.ts` | ✅ Done |
| 3 | **Schema Types** — All 14 table interfaces | `src/db/schema-character.ts` | ✅ Done |
| 4 | **TraitsService** — Permanent/World/Location CRUD | `src/characters/services/traits-service.ts` | ✅ Done |
| 5 | **MoodService** — Happiness, expression modifiers, delta | `src/characters/services/mood-service.ts` | ✅ Done |
| 6 | **RelationshipsService** — Bidirectional, standing/trust/familiarity | `src/characters/services/relationships-service.ts` | ✅ Done |
| 7 | **AvatarService** — Multi-avatar, context-aware selection, config | `src/characters/services/avatar-service.ts` | ✅ Done |
| 8 | **Traits Routes** — `/api/actors/:id/traits/*` | `src/routes/character-traits.ts` | ✅ Done |
| 9 | **Mood Routes** — `/api/actors/:id/mood/*` | `src/routes/character-mood.ts` | ✅ Done |
| 10 | **Relationships Routes** — `/api/actors/:id/relationships/*` | `src/routes/character-relationships.ts` | ✅ Done |
| 11 | **Avatar Routes** — `/api/actors/:id/avatars/*` | `src/routes/character-avatars.ts` | ✅ Done |
| 12 | **IO Exporter** — loop-lore native JSON v1.0 | `src/characters/exporters/character-systems.ts` | ✅ Done |
| 13 | **IO Importer** — upsert semantics | `src/characters/importers/character-systems.ts` | ✅ Done |
| 14 | **IO Routes** — export/import/import-url | `src/routes/character-io.ts` | ✅ Done |
| 15 | **Unit Tests** — 49 tests for all services | `src/characters/services/*.test.ts` | ✅ Done |
| 16 | **Test Helpers** — Shared FK utilities | `src/characters/services/test-helpers.ts` | ✅ Done |
| 17 | **Epic/Tasks** — Updated with concrete trait examples | `.plan/epics/epic-character-core-system.md` | ✅ Done |
| 18 | **Spec Update** — Mandatory/optional fields, NSFW, personality integrity | `docs/spec/character-setup.md` | ✅ Done |

---

## 🔲 Pending — Required Changes

### High Priority

| # | Feature | Description | Est. |
|---|---------|-------------|------|
| 1 | **Personality Integrity Validation** | Service that rejects personality trait changes at creation/update/import. Enforces immutability rules from spec. | M |
| 2 | **Licensing/Availability Routes** | API routes for `character_licensing` and `character_availability` tables (schema exists, no routes) | S |
| 3 | **Description Transfer** | Service + route for copying/merging/appending character descriptions between characters | M |
| 4 | **IO Route Tests** | Unit tests for export/import endpoints | S |

### Medium Priority

| # | Feature | Description | Est. |
|---|---------|-------------|------|
| 5 | **Extend CCv2/CCv3 Exporters** | Add new character fields (content_rating, traits summary) to existing exporters | S |
| 6 | **Extend CCv2/CCv3 Normalizers** | Parse incoming CCv2/CCv3 cards with extended fields into canonical format | S |
| 7 | **Batch Import/Export** | Export/import multiple characters at once | S |
| 8 | **IO Validation** | Validate imported data structure before applying (schema validation) | S |
| 9 | **Update Task Statuses** | Mark completed tasks in `.plan/tickets/` | XS |

### Low Priority

| # | Feature | Description | Est. |
|---|---------|-------------|------|
| 10 | **Emotion Detection Service** | Detect emotions from text for avatar selection (separate task) | L |
| 11 | **World Avatar Config Routes** | Routes for `world_avatar_config` table | S |
| 12 | **Admin Overrides Routes** | Routes for `admin_character_overrides` table | S |
| 13 | **Character Screen Filters** | NSFW/content filtering based on licensing/availability | M |
| 14 | **Memory Injection Integration** | Connect mood/relationships to memory injection probability | L |

---

## 📋 Notes

- **Personality Integrity**: Enforcement is documented in spec but needs explicit validation service that can be called at service boundaries
- **Description Transfer**: Spec defines `DescriptionTransfer` interface but no implementation exists
- **Existing Exporters**: CCv2/CCv3 exporters currently only handle base fields — need to include new character system data
- **Emotion Detection**: Listed as out-of-scope in epic but related to avatar selection — may want to defer or integrate

---

## 🎯 Recommended Next Steps

1. Mark completed tasks in `.plan/tickets/` (quick win)
2. Create Personality Integrity Validation Service (enforces immutability)
3. Create Licensing/Availability Routes (tables exist, just need routes)
4. Add IO Route Tests (validate export/import work)
5. Extend existing exporters to include new fields
