<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Message carriage fill path + detection

**Summary:** Detect locale at message write time and wire the translator role as one fill producer — without destroying the original text.
**Context:** The inbound funnel (`src/routes/messages/create.ts:153-154`) records no language signal, and `src/chat/auto-translate.ts:124-141` overwrites the body in place so the source is lost. The fill path writes a carriage row via the translator-role seam (`src/generation/translator-role.ts:51-65`, translator-to-general fallback) but preserves the original body. Detection prefers a lightweight script/CLD-style detector with no new dependency; otherwise it rides behind the existing LLM call.
**Acceptance Criteria:**

- [ ] Every new message writes one carriage row (`detected_locale`, labels, producer version) without mutating the message body
- [ ] Explicit contrast with the auto-translate overwrite is tested: original body byte-identical after fill
- [ ] No new dependency added unless the lightweight detector proves infeasible (then behind existing LLM call)
- [ ] Fill failures degrade to no-row (warn log), never block the write path
- [ ] Tests passing; docs updated

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-multilingual-carriage

git issue: 05341a5
