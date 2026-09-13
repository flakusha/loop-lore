<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Explicit approval flow for assistant mutations

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

Require user confirmation for all mutation commands in epic-assistant-entity-access (modify/apply/duplicate/adapt, world-update/delete, item-transfer/drop/pickup), modeled on OpenClaw permissions_list_open/respond plus Hermes command approval. Compose with requireWorldAccess/requireWorldOwner and reuse src/assistant/quality/entity-creation.ts gates. Acceptance: confirmation gate specified per command.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
