<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Chat Component Buttons — Improve & Attach Asset

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-chat-product-features

## Summary

Upgrade the message-component button row to expose an explicit "improve" action and an "attach asset" affordance. Image attachments must be fully supported end-to-end; the picker must be extensible so additional asset kinds (audio, video, file) can plug in without redesigning the button row or the upstream pipeline.

## Acceptance Criteria

- [ ] Message component exposes both `Improve` and `Attach` buttons in the action row
- [ ] `Improve` triggers the existing improve-message regeneration flow without losing position in the thread
- [ ] `Attach` opens an asset picker that currently supports images and is registered as an extensible slot for future kinds (audio/video/file)
- [ ] Attached assets are persisted alongside the message and rendered inline in the chat timeline
- [ ] Asset envelopes round-trip through `src/crypto/asset-encryption.ts` without leaking plaintext
- [ ] Mentions of the form `@asset:<id>` are recognised by `src/group-chat/mention-parser.ts`
- [ ] Component-level unit / Alpine coverage verifies the button wiring and picker slot extensibility

## Related Tickets / Epics

- epic-chat-product-features
- TASK-message-reactions-in-out-context
- TASK-show-assets-scenes-worlds-items-to-character-via-chat-contex
- TASK-message-quick-emojis-frontend
- TASK-chat-pins-frontend

## Files

- `src/components/chat/` — message action row + asset picker host
- `src/group-chat/mention-parser.ts`
- `src/crypto/asset-encryption.ts`
- `src/chat/service/write.ts`

## Open Questions

- Should the asset picker share state with the existing pin / emoji surfaces, or live behind its own Alpine component?
- Is there a hard cap on per-message asset count, or does storage policy decide?

