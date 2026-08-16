<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

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
3. How to handle asset references (inline vs external)?
4. Integrity checking (checksums, signatures)?
5. Compression strategies?
6. Backward compatibility approach?

## Acceptance Criteria

- [ ] Format comparison document (zip/tar/directory)
- [ ] Manifest schema specification
- [ ] Asset reference strategy documented
- [ ] Integrity checking approach defined
- [ ] Compression recommendations
- [ ] Backward compatibility plan
- [ ] Implementation recommendations
- [ ] Performance benchmarks for format options

## Notes

- Reference `epic-db-asset-snapshot-recovery.md` for recovery context
- Consider cross-platform compatibility
- Balance file size vs. portability
