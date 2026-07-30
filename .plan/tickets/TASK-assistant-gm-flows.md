# TASK: Assistant/GM Flows

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** High
**Epic:** epic-assistant-gm-flows

## Summary

Assistant/GM flows reconciliation — generation of new characters, items, worlds, locations with API call integrations AND confirmation/quality gating. From `epic-assistant-gm-flows.md`.

## Scope

### Generation Flow

- Character generation via assistant
- Item generation via assistant
- World/location generation via assistant

### Quality Gating

- Schema validation
- Consistency checks
- User confirmation

### Integration Points

- **GM Shadow Notes** — steer generation without player visibility
- **Character System** — generated characters target this system
- **World System** — generated worlds target this system

## Linked Epics

- `epic-assistant-gm-flows.md`

## Acceptance Criteria

- [ ] Character generation prompt templates
- [ ] Item generation prompt templates
- [ ] World/location generation prompt templates
- [ ] Quality validation catches schema errors
- [ ] User confirmation required before entity creation
- [ ] Integration with GM shadow notes for steering
- [ ] Unit tests for generation templates
- [ ] Integration tests for generation workflow

## Notes

- Reference `epic-assistant-gm-flows.md` for full system design
- See `src/assistant/commands/generate.ts` for generation commands
- Consider prompt template management
