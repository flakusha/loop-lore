# TASK: Character Bundle Format Research

**Status:** ⬜ Not Started
**Priority:** Low
**Effort:** Low
**Epic:** epic-db-asset-snapshot-recovery

## Summary

Research character bundle format for portable export/import. Define specification for character data + assets in single file with manifest and integrity checking.

## Research Questions

1. Single-file (zip/tar) vs directory-based bundles?
2. What metadata belongs in manifest (version, assets, dependencies)?
3. How to handle asset references (embed vs link)?
4. Compression options (gzip, zstd, none)?
5. Integrity checking (CRC32, SHA-256)?
6. Backward compatibility strategy?

## Deliverable

Document in `docs/meta/character-bundle-spec.md`:

- Bundle format specification
- Manifest schema
- Integrity checking approach

## Risk

Low — research only, no code changes.

## Related

- `src/characters/exporters/` — current export formats
- `src/characters/charx.ts` — CharX format
- `src/characters/parser.ts` — CanonicalCharacter parser
