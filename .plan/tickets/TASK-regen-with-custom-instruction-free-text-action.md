<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Regen with custom instruction free-text action

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

**Summary:**
Candidate-for-1.0.0 (feature-research #9, .tmp/intercom/FEATURE-RESEARCH-2026-11-11.md). Add a fourth `/regen` action, `custom`, that takes a free-text instruction ("redo, but keep her sarcastic") and runs it through the existing rewrite runner against the last assistant message. Serves the chat-as-product theme adjacency.

**Context:**
`/regen` is a FIXED three-action menu — Try Again / Add Details / More Concise (`src/assistant/commands/regen.ts`: USAGE at :17 declares exactly those; `actions: MessageActionDef[]` at :36; `runRegenAction` dispatches to the underlying rewrite/improve runners, `runRewrite` imported at :15). Each action is a registry-declared message action executed against the last assistant message. SCOPE: DISTINCT from the ticketed smart-regen work (`FEAT-smart-regen-decision-gate-in-main-pipeline` + `FEAT-style-picker-ui-for-smart-regen` — an automatic quality decision gate + fixed style picker in the main pipeline). This ticket is a single additive menu action with an explicit user-authored instruction; it does not touch the decision gate or the style catalog. Reproduction of the gap: giwt "regen" search shows only the smart-regen tickets.

**Acceptance Criteria:**

- [ ] `/regen custom <instruction...>` (and palette entry with a text input) registered as a `MessageActionDef` in the existing actions array
- [ ] Instruction flows through the `runRewrite` path with the instruction as the rewrite direction; empty instruction rejected with usage text
- [ ] Result replaces/branches the last assistant message with the same preview-confirm contract as the sibling actions (no silent overwrite)
- [ ] Capability declaration unchanged (`read-chat`, `network`) and guard coverage stays green (`capability-coverage.test.ts`)
- [ ] Unit tests: action dispatch, empty-instruction rejection, instruction reaching the rewrite runner

**Caveats:**

- Deliberately NOT the smart-regen decision gate; if both land, `custom` composes alongside it unchanged.
- Read-only lane evidence; verify against dev HEAD at implementation time.
