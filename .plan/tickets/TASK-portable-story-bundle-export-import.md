# TASK: Portable story bundle export import

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** medium
**Epic:** epic-import-export-io

## Summary

Source: second emergent sweep, DreamRunner.ai .drsf story export + Neta portability framing (candidate #32, gap G45 adjacency).

Single-file portable story bundle: transcript + characters + world snapshot + custom instructions + voice definitions; re-import recreates the playable story. Complements TASK-bulk-export-zip (backup-oriented) with a share-and-play format.

## Acceptance

- [ ] Versioned bundle schema (magic + format revision)
- [ ] Asset references embedded or checksum-verified
- [ ] Import validation with clear conflict errors
- [ ] Roundtrip test: export → import → playable

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
