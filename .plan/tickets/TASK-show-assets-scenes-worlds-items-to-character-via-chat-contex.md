# TASK: Show assets, scenes, worlds, items to character via chat-context injection

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Large
**Epic:** epic-context-injection-templates

## Summary

Function (assistant '/show' command or UI affordance) that injects a linked asset, gallery item, or user document — image/scene/world/item/etc — into the active chat context so the character "sees" it.

Verified absent during chat audit 2026-08-25:
- No ticket/epic for arbitrary asset/document injection into live chat context.
- No assistant 'show' command (grep src/assistant: none).
- Context-injection work (TASK-rag-pipeline-context, epic-context-injection-*) covers memory/RAG, not linked-asset/gallery/user-doc injection.
- TASK-multimodal-asset-reuse is generation-input reuse, not show-to-character.

Should reuse: polymorphic asset_links (label/entity_type/entity_id), gallery metadata (alt_text/mime_type/dimensions), and the user-document store. Reference SillyTavern 'show' / send-image-to-chat approach in research docs.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
