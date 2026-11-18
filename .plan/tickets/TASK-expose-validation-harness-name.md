<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Expose validation harness name

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Epic:** epic-chat-variants-taxonomy.md

**Summary:**

**Summary:**

Make the `llm_only` / `llm_only_group` validation-harness seed usable. The prompt section now consumes `gm_config.validation.harness`, but both variants seed an empty string and no UI or config surface lets an operator set a harness name, so the validation chats remain inert by default.

**Evidence (verified 2026-11-18, dev):**

- `src/assistant/prompt/sections/validation-harness.ts:5-9,20-39` reads the name and injects a wrapped system section only when non-empty.
- `src/chat/types/variants.ts:146,157` seed `gm_config: { validation: { harness: "" } }` for `llm_only` and `llm_only_group`.
- No UI or admin route writes a harness name; grep over `src/frontend`, `src/views`, `src/routes` finds no `validation.harness` writer.

**Scope:**

- Add one admin-controlled way to set the harness name for validation chats (either a config default consumed at chat creation, or a chat-level field on the new-chat form for validation-purpose variants).
- Keep the prompt section's untrusted wrapping and empty-string refusal; do not allow the name to become executable input.
- Either wire the value into both variants' creation path or remove the seed field and narrow the variant claim to “seeded validation prompt only”.
- Add a test that a configured name reaches the prompt section and that an empty name emits no section.

**Context:**

Follow-up to the 2026-11-18 multi-assistant/multi-LLM audit. Both `llm_only` variants seed `gm_config.validation.harness`, and `validationHarnessSection` now consumes it, but neither the variants nor the config surface exposes an operator-settable value — the validation prompt remains inert by default.

**Caveats:** TOCTOU: a changed name applies to subsequent turns, not in-flight ones. Security: harness name is untrusted text; keep `wrapUntrusted`. Authorization: only admin or the chat creator may set it. Parallelism: prompt assembly is per turn. Lock/unlock lifecycle: n/a. Partial failure: missing/invalid name degrades to no section. Rollback: additive field; default empty preserves today's output. Stale state: n/a. Data races: none. Idempotency: same name → same section. Observability: no new user-facing error.

**Acceptance Criteria:**

- [ ] An operator can set a non-empty harness name for validation chats without editing DB rows.
- [ ] The name reaches `validationHarnessSection` and is wrapped as untrusted text.
- [ ] Empty or malformed values emit no section and do not break chat creation.
- [ ] Tests and docs cover the setting.

