<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Chat Component Buttons — Improve & Attach Asset

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Done (2026-10-01)
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-chat-product-features

## Summary

Upgrade the message-component button row to expose an explicit "improve" action and an "attach asset" affordance. Image attachments must be fully supported end-to-end; the picker must be extensible so additional asset kinds (audio, video, file) can plug in without redesigning the button row or the upstream pipeline.

## Acceptance Criteria

- [x] Message component exposes both `Improve` and `Attach` buttons in the action row
- [x] `Improve` triggers the existing improve-message regeneration flow without losing position in the thread
- [x] `Attach` opens an asset picker that currently supports images and is registered as an extensible slot for future kinds (audio/video/file)
- [x] Attached assets are persisted alongside the message and rendered inline in the chat timeline
- [x] Asset envelopes round-trip through `src/crypto/asset-encryption.ts` without leaking plaintext
- [x] Mentions of the form `@asset:<id>` are recognised by `src/group-chat/mention-parser.ts`
- [x] Component-level unit / Alpine coverage verifies the button wiring and picker slot extensibility


## Verification (2026-10-01)

- **AC1** — `Improve` (user-authored) + `Attach` (all messages) buttons in the detailed
  action row, the compact hamburger menu, and the context menu
  (`src/components/chat/message-list.html`, testids `improve-message` / `attach-asset`).
- **AC2** — `improveMessage` (`src/frontend/alpine/chat-actions/message-actions.ts`)
  runs `POST /generation/prompt {mode:"improve"}`, persists via `PATCH /messages/:id`,
  then mutates the message in place — no list refetch, so scroll position is kept.
  Regression: `message-actions.test.ts` "prompt → PATCH → splice, no thread reload"
  asserts exactly two calls and zero `/chats/:id/messages` fetches.
- **AC3/AC7** — picker state + panel (`message-actions.ts` + `message-list.html`);
  kinds come from the exported `ASSET_PICKER_KINDS` registry consumed by
  `filterPickerAssets`. Extensibility test registers an `audio` kind and proves the
  filter widens without touching the attach flow.
- **AC4** — two persisted paths, both tested: (a) action-row `Attach` →
  `POST /api/v1/messages/:id/attachments` (`src/routes/messages/attach.ts`: ownership
  check, JSON merge append, `linkAsset`, idempotent retry) then the frontend refetches
  that single message so the enriched row (url/type/dimensions) renders inline;
  (b) composer `@asset:<id>` mentions → `create.ts` captures ids, strips tokens, merges
  into `attachments`. Tests: `src/routes/messages/attach.test.ts` (8),
  `create.coverage.test.ts` mention tests (2).
- **AC5** — pre-existing: `src/crypto/asset-encryption.ts` round-trip suite
  (`asset-encryption.test.ts`) proves no plaintext leak; not modified.
- **AC6** — `parseAssetMentions` / `stripAssetMentions` exported from
  `mention-parser.ts`; `stripLeadingMention` learned to leave `@asset:` tokens intact
  (attachment, not addressing). Tests: `mention-parser.test.ts` (+7 tests).
- **AC7 coverage** — `src/frontend/alpine/chat-actions/message-actions.test.ts`
  (11 tests: improve wiring, group level, error paths, registry extensibility, picker
  load/failure, attach success/rejection).
- Tests run 2026-10-01: `bun test --parallel=4 --isolate src/group-chat/mention-parser.test.ts
  src/routes/messages/attach.test.ts src/routes/messages/create.coverage.test.ts`
  → 67 pass / 0 fail; `bun test --parallel=1 --isolate …/message-actions.test.ts`
  → 11 pass / 0 fail.
- Locale keys (`chats.improveMessage`, `chats.attachAsset`, `chats.assetPicker*`,
  `toasts.messageImproved*`, `toasts.asset*`) added to all 10 locale files; picker
  styles in `src/public/css/app.css`.

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
