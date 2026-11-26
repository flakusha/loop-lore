<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: 1.0.0 THEME 3: Chat as the product: scripting-lite + product residual

**Status:** Done
**Status Note (2026-11-18):** AC3 and AC7 both verified on dev (dev @ 0f6c1e06c). AC3 (scripting-lite): the macro engine (`src/assistant/macro/engine.ts`, `src/assistant/macro/command-macros.ts`), the pipe operator (`src/assistant/commands/pipe.ts`), named args and per-command valves (`src/assistant/commands/valves.ts`, resolved in `src/routes/messages/command-run.ts`), the smart-regen decision gate (`src/assistant/commands/regen-gate.ts`, wired into `/regen` via `src/assistant/commands/regen.ts`) and the style-picker UI (`src/frontend/alpine/chat-style-picker.ts`, `src/frontend/alpine/chat-types/style-picker-state.ts`, markup in `src/components/chat/message-list.html`) are all on dev, each with its unit test file. Measured 2026-11-18: `bun test src/assistant/macro/engine.test.ts src/assistant/macro/command-macros.test.ts src/assistant/commands/pipe.test.ts src/assistant/commands/valves.test.ts src/assistant/commands/regen-gate.test.ts src/generation/smart-regen.test.ts src/frontend/alpine/chat-style-picker.test.ts` → 63 pass / 0 fail across 7 files. Docs: the macro/valve/pipe/regen-gate walkthroughs in `docs/spec/assistant-commands.md` and the TUI regenerate-with-style affordance in `docs/spec/terminal-ui.md` are on dev. The underlying tickets TASK-shared-macro-engine-for-templates-and-commands, TASK-named-arguments-for-slash-commands, TASK-per-command-valves-like-options-schema, TASK-pipe-operator-chaining-slash-commands and FEAT-smart-regen-decision-gate-in-main-pipeline are Done. FEAT-style-picker-ui-for-smart-regen still carries `**Status:** Not Started` although its code is on dev and all three of its acceptance boxes are checked — that ticket's own status field is the only thing outstanding on the scripting-lite side, and it is a separate ticket, not this one's scope. AC7 (chat residual): the ownership-transfer and membership-change re-key residual shipped as the re-scoped `epic-chat-multi-ownership` (migration `087_chat_owners.ts`, `src/chat/service/owners.ts` / `owners-core.ts` / `owners-events.ts`, `src/routes/chats/owners.ts`, the owners section in `src/frontend/alpine/chat-settings/ownership.ts`, call-site sweep) with all five chat-owners tickets Done (note: `.plan/epics/epic-chat-multi-ownership.md` still shows `**Status:** In Progress` and its five task checkboxes unticked, and `.plan/epics/epic-chat-product-features.md` still shows `**Status:** Not Started` — epic-file bookkeeping lags the shipped code and is outside this ticket's two-file scope), plus the shipped single-owner transfer (TASK-chat-feature-ownership-transfer, 6 ACs green) and the shipped membership-change key rotation (TASK-chat-feature-encryption-key-rotation, 9 ACs green; `rotateKeyOnLeave` / `distributeKeysOnJoin` in `packages/core/src/crypto/key-distribution.ts`). The nine migrations the residual analysis named (013, 014, 032, 037, 044, 045, 046, 047, 048) are all present on dev and are not re-opened by this ticket.
**Priority:** medium
**Effort:** Medium

**Summary:**

Rationale (as filed 2026-11-11, pre-implementation): 84 commands registered but no user-authorable composition: pipe operator, shared macro resolver, named args, per-command valves all Not Started; smart-regen transforms + decision gate Not Started. Pair with the narrowed chat-product-features residual (membership re-key, ownership transfer) after re-scoping the 9 already-landed migrations. Both halves have since shipped — see the Status Note for the verified evidence; the "Not Started" wording above records the filed premise, not the current state.

Feeds: stscript-guided-generations-2026-11-03 (TASK-shared-macro-engine, TASK-pipe-operator-chaining, TASK-named-arguments, TASK-per-command-valves, TASK-workflow-runner-start-preview-step-confirm-dispatch-step-ui; Quick-Reply Done vs macros gap); epic-priority-analysis §B2/C3 (re-scope chat-product-features); §C2 chat-variants-taxonomy

AC3 Scripting-lite: pipe chaining + shared macro resolver + named args + per-command valves shipped with unit tests; smart-regen decision gate in the main pipeline with style-picker UI.

AC7 Chat residual: membership-change re-key + ownership transfer shipped as the re-scoped epic; the 9 landed migrations closed out, not re-litigated.

Related: .tmp/research/release-1.0.0-roadmap.md
Scope note: serves Required chat-scenarios/branching/VN/scripting items + chat-product residual.

**Caveats:** TOCTOU: macro resolution at invocation time; concurrent definition edit uses snapshot. Security: macros expand author-controlled text; no privilege escalation via pipe. Authorization: pipe/valves respect per-command capability tags. Parallelism: parser unit tests use in-memory registry, no shared state. Partial failure: failed pipe stage aborts chain, no half-applied commands. Rollback: macro/pipe are additive syntax; removal restores prior parsing. Observability: pipe failures logged per stage.

**Context:**

Wave progress (scripting-lite lane): slice-1 (macro engine, named args, per-command valves, pipe operator), wave-3 (smart-regen decision gate `assistant.smartRegenGate` + `/regen` `/rewrite` style-picker UI + legacy template resolvers rewired onto the macro engine) and wave-4 (documentation walkthroughs in docs/spec/assistant-commands.md + docs/spec/terminal-ui.md, `GET /api/v1/commands` valve advertisement, TUI regenerate-with-style affordance via the completion strip) were implemented on the `scripting-lite` branch and are now LANDED ON DEV — see the implementation notes in TASK-shared-macro-engine-for-templates-and-commands, TASK-named-arguments-for-slash-commands, TASK-per-command-valves-like-options-schema, TASK-pipe-operator-chaining-slash-commands, FEAT-smart-regen-decision-gate-in-main-pipeline and FEAT-style-picker-ui-for-smart-regen. AC3 (scripting-lite) is shipped with unit tests. AC7 (chat residual) shipped separately as the re-scoped `epic-chat-multi-ownership`; see the Status Note for the verified file-level evidence.

Endpoint note: the valve advertisement route is `GET /api/v1/commands` (`src/routes/commands/index.ts`, mounted from `src/routes/v1/admin-surface.ts` with prefix `/api/v1`); the earlier `GET /api/commands` spelling in this ticket predates the v1 mount.

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated
