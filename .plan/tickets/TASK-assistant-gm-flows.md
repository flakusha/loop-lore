# TASK: Assistant/GM Flows

**Status:** 🟡 In Progress — GM Panel + Command Buttons Done
**Priority:** High
**Effort:** High
**Epic:** epic-assistant-gm-flows

## Summary

Assistant/GM flows reconciliation — generation of new characters, items, worlds, locations with API call integrations AND confirmation/quality gating. From `epic-assistant-gm-flows.md`.

## Current State (2026-08-01 review)

### Frontend: 🟡 Partial

- ✅ GM panel sidebar (`src/components/chat/gm-panel.html`) with shadow notes + whitenotes tabs
- ✅ GM panel Alpine component (`src/frontend/alpine/gm-panel.ts`) — full CRUD
- ✅ Command buttons expanded: guide, scene, summarize, rewrite, translate
- ✅ GmConfig extended with GM fields (assistantRole, visualNovel)
- ✅ GM role dropdown in chat settings (state flows load→save via `chat-settings.ts`)
- ❌ Slash command parser → ✅ **wired** (messages.ts:543 dispatch + 21 handlers)
- ❌ Tool call display in chat bubbles
- ❌ GM role switching has no runtime effect (`assistantRole` stored, never branched on)

### Backend: 🟡 Partial

- ✅ `/create` command — LLM entity generation (char/loc/world/item) with inline prompt templates, inserts to actors/locations/worlds/items
- ❌ No quality validation pipeline (schema/consistency/duplicate checks)
- ❌ No confirmation gating (direct insert, no user approval)
- ⚠️ **Resolution (gating + UX layer):** assistant-driven entity creation is specified
  as config-driven **workflow templates** in `epic-assistant-creative-studio-workflows.md`
  §7.6. Entity-generation workflows wrap `/create` with prompt preview, per-entity step
  validation (`entity_type_presets`), and confirmation/quality gates (schema/consistency/
  duplicate) — closing both gaps above without forking the creation backends. Tracked
  per-entity in `TASK-assistant-creative-studio-workflow-{character,world,location,item,npc}.md`.
- ✅ GameMasterService wired into story-mode generation (see `TASK-wire-gm-service-story-mode.md`)
- ❌ No shared prompt templates (`src/assistant/prompt/templates/` doesn't exist; prompts inline in create.ts)

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
- `epic-assistant-creative-studio-workflows.md` — provides the gating/UX workflow layer
  that closes the quality-validation + confirmation-gating gaps above (§7.6 entity workflows)

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
