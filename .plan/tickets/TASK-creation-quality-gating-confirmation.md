# TASK: Creation quality gating + confirmation

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

Add quality validation pipeline and user confirmation gating to the /create assistant command (epic-assistant-gm-flows critical gap).

Scope:
- Extract inline entityPrompts from src/assistant/commands/create.ts into config-driven entity-generation prompt templates (src/assistant/prompt/templates per epic note: those are entity-gen bodies, not system prompts).
- Schema validation: validate LLM JSON output against entity shape (reject malformed).
- Duplicate check: warn if a similar-name entity already exists in scope (actor/location/world/item).
- Consistency check: warn if generated content conflicts with active world/conversation context.
- Confirmation gating: require explicit user approval before entity insert (no silent create-entity).
- Generated content preview component + confirmation dialog in chat (Alpine) instead of direct insert.

Out of scope: slash-command parsing, /attack /heal combat, AI Director (P4), command-palette UI expansion.

Acceptance:
- /create returns preview+confirmation action, not direct DB insert for unconfirmed.
- Schema/duplicate/consistency gates present and unit-tested.
- Templates extracted; no inline prompt strings remain.


## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
