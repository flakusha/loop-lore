<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Wire variant picker into new-chat form

**Status:** Done
**Status Note:** Shipped 2026-10-22 — the new-chat form carries a picker with all twelve canonical variants, the choice is submitted as `variant` and the backend pins the triple from `VARIANT_DEFAULTS`, and the duplicate client-side taxonomy module was deleted in favour of the server table.
**Scope:** Close epic-chat-variants-taxonomy: wire the 12-variant picker into new-chat, fix variant override null handling and template-mode precedence, seed talkativity on member participants, reconcile epic/ticket metadata
**Priority:** medium
**Effort:** Medium

**Summary:**

The variantPicker Alpine slice exists as a standalone component but is not wired into new-chat.html. Users cannot select rpg/rpg_group variants when creating a chat from the UI. Need: add variant picker to new-chat form, persist variant on creation, wire to createChat API call.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-22 registry-driven close: git issue 8847e09 (registry tip: eef253732 Konstantin Fedotov Auto-closed: appended .md marker marks TASK-WIRE-VARIANT-PICKER-INTO-NE)
