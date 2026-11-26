<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Expose validation harness name

**Status:** Done
**Priority:** medium
**Effort:** Small
**Epic:** epic-chat-variants-taxonomy.md

**Summary:**

Shipped: the new-chat form exposes `#chat-validation-harness` for the two validation variants, the create route persists `gm_config.validation.harness`, and the prompt section injects non-empty values as wrapped untrusted text.

**Verification (2026-11-19):**

- `src/views/new-chat.html:142-152` and `src/frontend/pages/new-chat/submit.ts` send the trimmed name only for `llm_only` / `llm_only_group`; `src/frontend/pages/new-chat/state.ts` shares that predicate with the visibility toggle in `index.ts`.
- `src/validation/schemas/primitives.ts:114` accepts the field; `src/assistant/prompt/sections/validation-harness.ts:20-40` emits nothing for an empty or malformed value.
- Targeted submit, prompt-section, and chat-create tests are green. The guided `llm_only_group_gm` variant no longer receives the harness field or loses its `gm_profile` seed.

**Context:**

Closed after the 2026-11-19 release review. The original premise ("no UI writes a harness name") was stale; the real defect was the `startsWith("llm_only")` predicate leaking onto the Guided/Story variant. Autonomous LLM-to-LLM execution for `llm_only` is a separate, unbuilt feature and is not part of this ticket.

**Caveats:** TOCTOU: a changed name applies to subsequent turns, not in-flight ones. Security: harness name is untrusted text; keep `wrapUntrusted`. Authorization: settings-authorized chat actors may set it; the value is a label, not executable input. Parallelism: prompt assembly is per turn. Lock/unlock lifecycle: n/a. Partial failure: missing/invalid name degrades to no section. Rollback: additive field; default empty preserves today's output. Stale state: n/a. Data races: none. Idempotency: same name → same section. Observability: no new user-facing error.

**Acceptance Criteria:**

- [x] An operator can set a non-empty harness name for validation chats without editing DB rows.
- [x] The name reaches `validationHarnessSection` and is wrapped as untrusted text.
- [x] Empty or malformed values emit no section and do not break chat creation.
- [x] Tests and docs cover the setting.

