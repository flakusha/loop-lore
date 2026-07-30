# EPIC: Assistant/GM Flows Reconciliation

**Status:** 📝 Draft
**Priority:** High
**Effort:** High
**Type:** Feature Epic
**Tags:** assistant, gm, generation, content-creation, quality-gating

## Summary

Assistant/GM flows reconciliation — generation of new characters, items, worlds, locations, etc. with API call integrations AND confirmation/quality gating.

## Reference

- Spec: `docs/spec/assistant-commands.md`

## Scope

- Character generation via assistant
- Item generation via assistant
- World/location generation via assistant
- API call integrations (external services)
- Confirmation gating (user approval)
- Quality gating (validation, consistency)

## Design

### Generation Flow

```
User request → Assistant processes → Generate content → Quality check → User confirmation → Create entity
```

### Quality Gating

| Gate              | Check                  | Action               |
| ----------------- | ---------------------- | -------------------- |
| Schema validation | Valid data structure   | Reject if invalid    |
| Consistency check | Matches world/setting  | Warn if inconsistent |
| Duplicate check   | No existing duplicates | Warn if duplicate    |
| User confirmation | Explicit approval      | Require approval     |

## Tasks

- [ ] Character generation prompt templates
- [ ] Item generation prompt templates
- [ ] World/location generation prompt templates
- [ ] API call integration framework
- [ ] Confirmation dialog component
- [ ] Quality validation pipeline
- [ ] Generated content preview

## Files

- `src/assistant/commands/generate.ts` — generation commands
- `src/assistant/prompt/templates/` — prompt templates
- `src/components/generation-preview.html` — preview component
- `src/validation/` — quality validation

## Acceptance Criteria

- [ ] Generation commands for characters, items, worlds, locations
- [ ] Quality validation catches schema errors and inconsistencies
- [ ] User confirmation required before entity creation
- [ ] Generated content preview shows what will be created
- [ ] Tests passing

## Related Epics

### Story Steering & Notes

- `epic-gm-shadow-notes.md` — **direct dependency**. Whitenotes and shadow notes steer LLM generation. GM/assistant creates shadow notes to influence narrative without player visibility. This epic generates the content; shadow notes steer _how_ it's generated.

### Narrative Agency

- `epic-agency-story-points.md` — player meta-currency (Bennies/Fate Points) spent to influence generation. Connects to quality gating: player can spend points to override or enhance generated content.

### Content Generation Targets

- `epic-character-core-system.md` — character generation output targets this system's data model
- `epic-items.md` — item generation output targets item system
- `epic-worlds-extension.md` — world generation output targets world system
- `epic-locations.md` — location generation output targets location system
- `epic-npcs.md` — NPC generation inherits from actor model

### Supporting Systems

- `epic-actors.md` — all generated entities become actors
- `epic-rpg-mechanics.md` — stat generation follows RPG rules
- `epic-plugin-system.md` — generation may use plugins for custom templates

## Tickets

- `TASK-assistant-gm-flows.md` — main implementation tasks
- `TASK-assistant-gm-flows-reconciliation.md` — reconciliation tasks
