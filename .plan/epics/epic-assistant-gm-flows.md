# EPIC: Assistant/GM Flows Reconciliation

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** High
**Type:** Feature Epic

## Summary

Assistant/GM flows reconciliation — generation of new characters, items, worlds, locations, etc. with API call integrations AND confirmation/quality gating.

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

| Gate | Check | Action |
| ---- | ----- | ------- |
| Schema validation | Valid data structure | Reject if invalid |
| Consistency check | Matches world/setting | Warn if inconsistent |
| Duplicate check | No existing duplicates | Warn if duplicate |
| User confirmation | Explicit approval | Require approval |

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
