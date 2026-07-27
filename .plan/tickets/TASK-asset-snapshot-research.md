# TASK: Asset Storage Snapshot Research

**Status:** ⬜ Not Started
**Priority:** Low
**Effort:** Low
**Epic:** epic-db-asset-snapshot-recovery

## Summary

Research asset storage snapshot options. Evaluate content-addressable storage, filesystem snapshots, and application-level bundling for disaster recovery.

## Research Questions

1. Is content-addressable storage (SHA-256 dedup) worth complexity for local filesystem?
2. Can we use OS-level snapshots (LVM/ZFS/Btrfs) instead of app-level?
3. What's the cost of full-copy versioning for images/media?
4. Should assets be bundled with character exports?
5. How to handle orphaned assets (no entity links)?

## Deliverable

Document in `docs/meta/asset-snapshot-research.md`:

- Storage snapshot strategies comparison
- Cost/benefit analysis
- Recommended approach

## Risk

Low — research only, no code changes.

## Related

- `src/assets/` — current asset handling
- `src/db/schema-content.ts` — asset tables
