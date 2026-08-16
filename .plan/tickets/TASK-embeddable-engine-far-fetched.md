<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Embeddable Engine (Far-Fetched)

**Status:** ⬜ Not Started
**Priority:** Low
**Effort:** Very High
**Epic:** epic-embeddable-engine

## Summary

Embed the RPG engine as a standalone library for external use. Enable other applications to use loop-lore's game mechanics. From `epic-embeddable-engine.md` (inferred).

## Scope

### Engine Extraction

- Extract RPG core into standalone package
- Remove server dependencies
- Create clean API surface

### Package Distribution

- NPM package publishing
- TypeScript definitions
- Documentation and examples

### Integration Points

- Character system
- Combat system
- World system
- Quest system

## Acceptance Criteria

- [ ] RPG core extracted into standalone package
- [ ] No server dependencies in core package
- [ ] Clean API surface for external use
- [ ] NPM package published
- [ ] TypeScript definitions included
- [ ] Documentation and usage examples
- [ ] Unit tests for extracted engine
- [ ] Integration tests for package usage

## Notes

- This is a far-fetched goal — focus on making core extractable first
- Consider which systems are truly independent
- Reference `TASK-create-library-package.md` for library packaging
