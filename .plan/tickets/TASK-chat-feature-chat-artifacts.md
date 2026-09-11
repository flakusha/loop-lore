<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Chat Artifacts — Rich Generated Content Rendered In-Chat

**Status:** ⬜ Not Started
**Priority:** Low
**Effort:** High
**Type:** Feature Ticket
**Tags:** chat, feature, artifacts, rich-content, rendering
**Epic:** epic-chat-product-features

## Summary

First-class chat artifacts: rich generated content (documents, tables, UI snippets, visualizations) produced by the LLM inside a conversation and rendered as a dedicated surface linked to its message — the LLM-industry "artifact" pattern (Anthropic-style), today only a P6+ umbrella entry in `.plan/backlog/open-deferred.md` with no owning ticket. Distinct from media assets (owned by the asset platform) and from scene art (`TASK-chat-feature-scene-art-generation`): artifacts are **structured/interactive content**, not images.

## Acceptance Criteria

- [ ] A message can carry an artifact reference; the artifact renders in an expandable surface, not inline in the transcript
- [ ] Artifact content is persisted as a first-class entity (message-linked), versioned on regenerate/branch — forks create artifact versions, per `TASK-chat-feature-message-edit-resubmit-branch`
- [ ] Rendering is sandboxed (no raw HTML/JS execution without sanitization; see `TASK-frontend-sanitize-fallbacks-inject-raw-html-when-lib-missing` precedent)
- [ ] Artifacts pass the moderation/NSFW pipeline like message content before render
- [ ] Encrypted variants encrypt artifact payloads with the chat key
- [ ] Export/share includes artifacts or degrades to a labeled placeholder (per `TASK-chat-feature-share-links-export-formats`)
- [ ] Artifact generation is budget-aware: artifact body never enters the LLM context window, only a reference/summary does

## Related Epics / Tickets

- Parent: `epic-chat-product-features`
- `epic-asset-platform-capabilities` — storage/rendition primitives to reuse
- `TASK-chat-feature-message-edit-resubmit-branch` — versioning on fork
- `TASK-chat-feature-share-links-export-formats` — export posture
- `.plan/backlog/open-deferred.md` P6+ umbrella entry — this ticket gives it an owner

## Files

- `src/chat/service/` — artifact linkage + persistence
- `src/components/chat/` — artifact surface + sandboxed rendering
- `src/routes/` — artifact fetch endpoints

## Research Inputs

- LobeChat Artifacts/Canvas: SVG/HTML/rich docs rendered in-conversation (deepwiki lobehub/lobe-chat, 2026-09-11)
- RisuAI additional-asset embedding syntax (`{{image::}}`, `{{raw::}}`) as inline-reference precedent (deepwiki kwaroran/RisuAI, 2026-09-11)

## Open Questions

- Which artifact kinds ship first — markdown docs, tables, or HTML snippets?
- Are artifacts editable in-place (canvas-style) or immutable once generated?
