<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: handleExportAll leaks group-chat participants messages - exports all messages in chats created_by caller, ignoring participant membership

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

**Severity (revised 2026-09-20):** MEDIUM (not HIGH — messages are not actually exported; see Resolution)

**Where:** src/routes/settings.ts:81-118

**Defect:** handleExportAll() selects all chats where created_by = caller (no participant-membership filter). The current ZIP contains settings.json + characters.json + chats.json + assets.json. It does NOT include message bodies, so the original "leaks private messages" claim is wrong. However:

1. chats.json dumps full chat rows including chat metadata that other group participants can see (chat title, settings, member list).
2. For any group chat the caller created, they get all of it regardless of whether they still participate — there is no `left_at`/membership filter.
3. If message export is later added (per-user export-all feature work), the same created_by-only filter pattern would re-introduce a real leak.

**Fix sketch:** Restrict `chats` query to chats where caller is a current participant (join chat_participants), not just created_by. Document the constraint near the function.

## Resolution

Verified 2026-09-20 against dev ada2dd920. Original ticket claim overstated: handleExportAll does not export messages today. Revised scope: chat metadata leak via created_by-only filter, plus preventive guard for future message export.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
