<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Frontend — Chat Setup Templates (edit/delete)

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ⬜ Not Started
**Priority:** P2 — Medium
**Effort:** Small
**Epic:** epic-chat-product-features
**Source:** FE-BE harmonization check, 2026-09-17 — 2 routes in this slice.

## Summary

Wire the PUT/DELETE methods on chat setup templates. Reads exist; mutation does not.

## Backend surface

| Method | Path | File |
|--------|------|------|
| PUT | `/api/chat-setup-templates/:templateId` | `src/routes/chats/templates.ts:98` |
| DELETE | `/api/chat-setup-templates/:templateId` | `src/routes/chats/templates.ts:130` |

## Acceptance Criteria

- [ ] Template list page exposes edit (PUT) + delete (DELETE) actions
- [ ] Edit opens an inline form; PUT saves
- [ ] Delete shows a confirm dialog; DELETE removes
- [ ] List refreshes after mutation
- [ ] `bun run check` green
