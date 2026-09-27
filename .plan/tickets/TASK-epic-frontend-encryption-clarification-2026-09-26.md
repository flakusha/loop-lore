<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-epic-frontend-encryption-clarification-2026-09-26: clarify epic-frontend-encryption.md vs epic-encryption-workflow.md split

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Type:** Task
**Summary:** `epic-frontend-encryption.md` (29 lines, 4 commits, last touch 2026-09-18) is a placeholder with no concrete Tasks or Acceptance Criteria. Its name overlaps with `epic-encryption-workflow.md` (which now has 27 tickets and is the operational authority) and `epic-crypto.md` (which owns the cryptographic primitives).
**Context:** The 2026-09-25 logging hardening cluster surfaced repeated confusion about which epic owns the **send-decrypt UI path**. `epic-frontend-encryption.md` was created as a placeholder for the receive-decrypt + key-management UI; that work has since been split into tickets under `epic-encryption-workflow.md` and `epic-chat-product-features.md` (encryption-key-rotation). Source row: 2026-09-26 epic audit.

**Decision required:** pick ONE of:

1. **Repurpose** — re-scope `epic-frontend-encryption.md` to the **receive-decrypt + key-management UI surface only** (the gap that still exists post-hardening). Add Tasks + Acceptance Criteria reflecting that scope.
2. **Deprecate** — the work belongs under `epic-encryption-workflow.md` (P3-P5 cluster) and `epic-chat-product-features.md` (encryption-key-rotation P0). Delete this file.
3. **Split** — break into `epic-frontend-decrypt-ui.md` + `epic-frontend-key-management-ui.md` with concrete ticket references.

**Open questions:**
- Is the receive-decrypt path truly a separate concern from `epic-encryption-workflow.md`'s "Decrypt + Display" milestone?
- Are there any UI-specific concerns (browser Web Crypto availability, fallback for older browsers per `epic-non-standard-browser-crypto.md`) that warrant a separate epic?
- Does the `encryption_key_management` UI overlap with `epic-byok-api-keys.md`'s API-key UI?

**Acceptance Criteria:**
- [ ] Disposition chosen; rationale documented in epic's `## Summary`
- [ ] If repurpose: epic now has Tasks + Acceptance Criteria + Related Epics; cross-references with `epic-encryption-workflow.md` and `epic-chat-product-features.md` made explicit
- [ ] If deprecate: file deleted; cross-references updated in sibling epics
- [ ] If split: new files created with full scope; this file deleted
- [ ] No `_TBD_` placeholders remain in the surviving epic(s)

**Tags:** meta, epic-audit, frontend, encryption, clarification
**Related:** .plan/epics/epic-frontend-encryption.md, .plan/epics/epic-encryption-workflow.md, .plan/epics/epic-chat-product-features.md, .plan/epics/epic-crypto.md, .plan/tickets/TASK-chat-feature-encryption-key-rotation.md


git issue: f01b0db
