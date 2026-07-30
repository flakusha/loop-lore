# TASK: CLI Import/Export Commands

**Status:** ⬜ Deferred to v2
**Priority:** Low
**Effort:** Low
**Epic:** epic-import-export-io

## Summary

Add CLI commands for importing and exporting character cards without the web UI. Useful for batch operations, scripting, and headless environments.

## Acceptance Criteria

- [ ] `loop-lore import <file>` — import character card from file
- [ ] `loop-lore export <actor-id> [--format ccv2|ccv3|yaml|toml|png]` — export character
- [ ] `loop-lore export --all [--dir ./export]` — batch export all characters
- [ ] Proper error messages, progress output
- [ ] --help documentation

## Technical Notes

- Use existing parser/exporter functions directly
- Read from stdin for pipe workflows
- Write to stdout or file based on --output flag
- Consider: Bun built-in CLI arg parsing or tiny library

## Example Usage

```bash
# Import single character
loop-lore import ./my-character.json

# Export as CCv3
loop-lore export actor-abc123 --format ccv3 --output ./exported.json

# Batch export all characters
loop-lore export --all --dir ./backup/characters
```

## Files

- `src/cli/import.ts` — import command (TBD)
- `src/cli/export.ts` — export command (TBD)

## Linked Epics

- `epic-import-export-io.md`
