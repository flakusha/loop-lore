<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Composer primitive extraction

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-chat-composer-flows
**Tags:** frontend, refactor, composer

**Summary:**

## Problem

The chat composer has reusable primitives trapped inside Alpine component state:
- `autoResize` lives as a ChatState method at `src/frontend/alpine/chat-messages.ts:189` and cannot be reused by other text surfaces.
- Draft persistence logic in `src/frontend/alpine/chat-drafts.ts` is coupled to chat state and cannot be shared.
- The markdown preview/sanitize module `composer-pre-send/preview.ts` is already framework-agnostic but undocumented as a shared primitive.

## Change

Extract framework-agnostic primitives into standalone modules:
- `autoResize(el, maxPx=200)` → `src/frontend/alpine/auto-resize.ts` (moved off the ChatState method at `chat-messages.ts:189`).
- Keyed localStorage draft store → `src/frontend/alpine/draft-store.ts` exporting `createKeyedDraftStore({prefix, indexKey, maxChars, maxEntries, ttlMs, storage, now})`, with `chat-drafts.ts` refactored to consume it (MRU/LRU eviction + optional TTL; distinct from the TTL-based `composer-pre-send/draft-codec.ts`).
- Document `composer-pre-send/preview.ts` as a shared primitive (no code change needed).

## Acceptance

- Each primitive is importable with no Alpine / `this` / chat dependency.
- Existing `chat-messages` / `chat-drafts` tests pass unmodified.
- New unit tests cover: maxPx clamping, custom draft prefix, eviction (MRU/LRU), TTL expiry.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
