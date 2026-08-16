<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Config Migration Tool

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** EPIC-2026-39 (Config File Separation)

## Summary

Build a CLI tool to automatically split an existing monolithic `configs/config.toml` or `configs/config.yaml` into domain-specific config files.

## Features

- Parse monolithic config file
- Split into domain-specific files
- Generate JSON schemas for each domain
- Output to `configs/` and `schemas/` directories
- Dry-run mode to preview changes
- Backup of original monolithic config

## Usage

```bash
bun run scripts/migrate-config.ts --input configs/config.toml --dry-run
bun run scripts/migrate-config.ts --input configs/config.toml
```

## Acceptance Criteria

- [ ] Monolithic config splits correctly
- [ ] Domain files created in `configs/`
- [ ] Schemas generated in `schemas/`
- [ ] Dry-run mode works
- [ ] Original config backed up
- [ ] All existing tests pass

## Linked Epics

- `epic-config-file-separation.md`
