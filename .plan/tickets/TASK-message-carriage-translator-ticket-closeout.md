<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Message carriage translator-ticket closeout

**Summary:** Verify the drifted `TASK-translator-model-role-with-general-model-fallback` ticket against shipped code; propose a status flip in this ticket body only.
**Context:** The translator-role ticket (`TASK-translator-model-role-with-general-model-fallback.md`, currently Not Started, Epic: aux-enrichment-pipeline) appears to describe code that already ships: `resolveTranslatorRole` in `src/generation/translator-role.ts:51-65` owns the translator-to-general fallback exactly as specced (unset or half-configured resolves through the `main` role so a `main` DB override is honoured — verified 2026-10-23). The worker for THIS ticket verifies each spec claim against the code and records the verdict below. The worker MUST NOT edit the translator ticket itself — only propose the flip here.
**Acceptance Criteria:**

- [ ] Each spec claim (env vars, config key, admin panel entry, resolveTranslatorRole seam, /translate + /tl + auto-translate consumption, fallback rule) verified against code with file:line refs
- [ ] Verdict recorded here: close as Done, keep open with remaining delta, or split
- [ ] The translator ticket itself is NOT edited by this work
- [ ] If verdict is Done: exact status-flip proposal (Status + Resolved line) pasted in this ticket body for the owner to apply

**Status:** Not Started
**Priority:** low
**Effort:** Small
**Epic:** epic-multilingual-carriage