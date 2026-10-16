<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: Chat-setup config drops user gmConfig and never reads worldId

**Status:** Done
**Priority:** medium
**Effort:** Medium

> **Closed as a duplicate.** This defect is already tracked in detail by
> `BUG-character-and-chat-setup-example-configs-document-fields-the`, point (3),
> which cites the same `src/chat/service/templates.ts:117` line and the same
> `worldId` / `gmConfig` drop. Filing it twice would split the ledger, so this
> entry is retired. Track the fix there.

**Summary:**

toTemplateDefault in src/chat/service/templates.ts:104-123 never reads a user-supplied gmConfig. Line 117 derives gmConfig entirely from the visualNovel boolean, so a gmConfig authored in configs/templates/chat-setup.yaml is discarded with no warning. worldId is never read at all, even though src/chat/service/types.ts:73 declares world_id on the runtime type, so the capability exists but is unreachable from config.

Both are silent losses rather than crashes, so a config file that appears correct has no effect. Either honour the supplied value or stop documenting it in configs/templates/chat-setup.example.yaml.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
