# TASK: Config Domain Loader with Merging

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Medium
**Epic:** EPIC-2026-39 (Config File Separation)

## Summary

Implement config loader that reads domain-specific config files and merges them into a unified config object. Supports fallback to monolithic config for backward compatibility.

## Features

- Load all `configs/config.*.toml` / `configs/config.*.yaml` files
- Merge domain configs into single runtime config
- Preserve existing `configs/config.toml` as fallback
- Domain ordering preserved (server → db → assets → assistant → ...)
- Error reporting per domain

## Acceptance Criteria

- [ ] Domain configs load and merge correctly
- [ ] Monolithic fallback works
- [ ] No functionality lost
- [ ] All existing tests pass
- [ ] Error messages identify which domain failed

## Linked Epics

- `epic-config-file-separation.md`
