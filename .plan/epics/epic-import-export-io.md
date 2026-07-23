# Epic 14: Import/Export & Data Portability — Implementation Plan

**Status:** 📝 Doc reconciled — feature NOT yet built (reconciled 2026-07-19)\
**Worktree:** `tree/feat-14-io`\
**Branch:** `feat-14-io`

---

## Current State Assessment

### Existing Code

| File                              | Lines | Status  | Gaps                                                       |
| --------------------------------- | ----- | ------- | ---------------------------------------------------------- |
| `src/routes/import.ts`            | 148   | Partial | Only JSON/PNG/YAML/TOML; no CCv3/CHARX; no lorebook import |
| `src/routes/chat-export.ts`       | 125   | Partial | Only Markdown/JSON; no HTML/text; no bulk export           |
| `src/characters/steganography.ts` | 116   | Partial | PNG extraction only; no writing; no V3 chunk support       |

### Documentation Created

- `docs/spec/io-formats.md` — Complete format specifications (10 sections)
- Covers: CCv2, CCv3, Character.AI, PNG, CHARX, YAML, TOML, chat exports, bulk export

---

## Implementation Phases

### Phase 1: Core Import (Week 1)

**Goal:** Auto-detection + all character format normalizers

| Task                     | Files                                              | Effort |
| ------------------------ | -------------------------------------------------- | ------ |
| Auto-detection algorithm | `src/characters/parser.ts` (new)                   | Med    |
| CCv2 normalizer          | `src/characters/normalizers/ccv2.ts` (new)         | Low    |
| CCv3 normalizer          | `src/characters/normalizers/ccv3.ts` (new)         | Med    |
| Character.AI normalizer  | `src/characters/normalizers/character-ai.ts` (new) | Low    |
| JSON flat normalizer     | `src/characters/normalizers/json-flat.ts` (new)    | Low    |
| Update import route      | `src/routes/import.ts`                             | Low    |

### Phase 2: PNG + CHARX (Week 2)

**Goal:** Full PNG read/write + CHARX bundles

| Task                    | Files                             | Effort |
| ----------------------- | --------------------------------- | ------ |
| PNG chunk writer        | `src/characters/steganography.ts` | Med    |
| V3 PNG support          | `src/characters/steganography.ts` | Low    |
| CHARX extraction        | `src/characters/charx.ts` (new)   | Med    |
| CHARX export            | `src/characters/charx.ts`         | Med    |
| Asset import from CHARX | `src/characters/charx.ts`         | Med    |

### Phase 3: Export (Week 3)

**Goal:** All export formats + bulk export

| Task                       | Files                                     | Effort |
| -------------------------- | ----------------------------------------- | ------ |
| YAML exporter              | `src/characters/exporters/yaml.ts` (new)  | Low    |
| TOML exporter              | `src/characters/exporters/toml.ts` (new)  | Low    |
| PNG exporter (dual chunks) | `src/characters/exporters/png.ts` (new)   | Med    |
| CHARX exporter             | `src/characters/exporters/charx.ts` (new) | Med    |
| Bulk ZIP export            | `src/routes/export.ts` (new)              | Med    |

### Phase 4: Chat Export (Week 3-4)

**Goal:** All chat export formats

| Task                    | Files                       | Effort |
| ----------------------- | --------------------------- | ------ |
| HTML chat export        | `src/routes/chat-export.ts` | Low    |
| Plain text chat export  | `src/routes/chat-export.ts` | Low    |
| Chat export with assets | `src/routes/chat-export.ts` | Med    |

---

## Questions for User

### Priority Questions

1. **Format Priority:** Which formats are most important to implement first?
   - [ ] CCv2 (SillyTavern/Chub) — highest compatibility
   - [ ] CCv3 (RisuAI) — modern standard with assets
   - [ ] Character.AI — popular platform
   - [ ] PNG-embedded — sharing format
   - [ ] CHARX — bundle format with assets

2. **Export Scope:** What chat export formats do you need?
   - [ ] JSON (structured, full metadata)
   - [ ] Markdown (readable, shareable)
   - [ ] HTML (styled, self-contained)
   - [ ] Plain text (minimal)
   - [ ] All of the above

3. **Bulk Export:** Do you need bulk export (ZIP archive) in v1?
   - [ ] Yes — full backup/restore capability
   - [ ] No — single character/chat export only
   - [ ] Defer to v2

4. **Lorebook Import:** Should lorebook entries be imported with characters?
   - [ ] Yes — full lorebook support
   - [ ] No — character data only, lorebooks separately
   - [ ] Partial — basic entries only (keys + content)

5. **Asset Handling:** How should embedded assets (CHARX, V3) be handled?
   - [ ] Auto-import to asset system
   - [ ] Prompt user for each asset
   - [ ] Skip assets, import card only

### Technical Questions

1. **PNG Writing:** Should we write both V2+V3 chunks for maximum compatibility?
   - [ ] Yes — always write both (recommended)
   - [ ] V3 only — modern format
   - [ ] Configurable via settings

2. **Error Handling:** How strict should format validation be?
   - [ ] Strict — reject invalid cards
   - [ ] Lenient — import with warnings
   - [ ] Configurable per format

3. **Testing:** What test coverage target?
   - [ ] Unit tests for all normalizers
   - [ ] Integration tests for import/export pipeline
   - [ ] Round-trip tests (import → export → import)
   - [ ] All of the above

### Scope Questions

1. **URL Import:** Should we support importing from URLs (Chub.ai, direct links)?
   - [ ] Yes — fetch from URL
   - [ ] No — file upload only
   - [ ] Defer to v2

2. **CLI Support:** Should we add CLI commands for import/export?
   - [ ] Yes — `loop-lore import/export` commands
   - [ ] No — web UI only
   - [ ] Defer to v2

---

## Recommended Priority

Based on research and existing code:

1. **CCv2 + PNG** — Highest compatibility, existing steganography code
2. **CCv3 + CHARX** — Modern standard, asset support
3. **Character.AI** — Popular platform, simple format
4. **YAML/TOML** — Loop-lore native, already supported in import
5. **Bulk Export** — Full backup capability

---

## Next Steps

1. **Await user decisions** on questions above
2. **Create task breakdown** based on decisions
3. **Start Phase 1** with auto-detection + CCv2 normalizer
4. **Iterate** based on testing and feedback

---

## Dependencies

### Already in package.json

- `js-yaml` — YAML parsing
- `smol-toml` — TOML parsing

### New Dependencies

None required — PNG metadata and ZIP extraction use native Bun APIs.

---

## Testing Strategy

| Test Type   | Coverage                    | Files                                   |
| ----------- | --------------------------- | --------------------------------------- |
| Unit        | Auto-detection, normalizers | `src/characters/*.test.ts`              |
| Integration | Import/export pipeline      | `src/characters/integration.test.ts`    |
| Round-trip  | Import → Export → Import    | `src/characters/roundtrip.test.ts`      |
| E2E         | Full user workflow          | `tests/e2e/flows/import-export.test.ts` |

---

## References

- `docs/spec/io-formats.md` — Complete format specifications
- `docs/spec/character-setup.md` — Character system overview
- `docs/spec/assets.md` — Asset pipeline
- `docs/meta/plan.md` — v0.1 implementation plan

## Linked Tasks

- TASK-import-export-io.md
