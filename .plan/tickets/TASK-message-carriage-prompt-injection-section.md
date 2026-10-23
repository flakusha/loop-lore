<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Message carriage prompt injection section

**Summary:** New prompt section injecting carriage labels (mirroring `src/chat/service/carriage.ts:90-148`) with strip-before-wire so labels never reach participants.
**Context:** The `carriage_records` prompt section (`src/chat/service/carriage.ts:90-148`) is the injection precedent: latest payload read through a healing gate, toggle-off byte-identical. The new section injects per-message carriage labels (`detected_locale` + classification labels) into the assembled prompt. Strip-before-wire mirrors `tool-execution.ts:239-243` — carriage content is prompt-internal and must never leak onto the participant wire.
**Acceptance Criteria:**

- [ ] Prompt section reads latest carriage rows and injects labels; toggle-off stays byte-identical
- [ ] Strip-before-wire keeps carriage content off every participant-visible payload
- [ ] Isolation: no cross-read of other hidden scopes (mirror carriage-isolation visibility rules)
- [ ] Tests cover: injection present, toggle-off identical, strip removes all carriage markers
- [ ] Docs updated

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Epic:** epic-multilingual-carriage