# BUG: account-tier custom instructions render as system message without injection preamble - GM override vector

**Status:** [OK] Resolved (worktree fix-account-tier-custom-instructions-preamble)

**Priority:** medium

**Effort:** Medium

## Summary

Custom-instructions section now shares the data-only `wrapUntrusted` helper
from `system.ts` (previously a private function). Account-tier user steering
text and story-tier overrides are now wrapped with the same preamble the
system section uses, which instructs the LLM to treat the inner text as data
only — not as authoritative instructions that can override the GM contract
in shared story chats.

The local wrapper in `custom-instructions.ts` emitted only the
`<untrusted_user_content>` tag without the preamble. Drift between the two
wrappers is the exact bug filed here.

## Fix surface

- `src/assistant/prompt/sections/system.ts:25-39` — `wrapUntrusted` is now
  exported with a JSDoc warning against re-duplication.
- `src/assistant/prompt/sections/custom-instructions.ts:25` — imports the
  shared helper; the local duplicate wrapper and its JSDoc were removed.
- `src/assistant/prompt/sections/custom-instructions.ts:14-22` — top-level
  JSDoc updated to reflect the actual trust model (data-only preamble
  prevents GM-contract override).

## Acceptance Criteria

- [x] Implementation complete — both sections share the wrapper.
- [x] Tests passing — 10/10 custom-instructions tests + 5/5 system tests +
  68/68 across all `src/assistant/prompt/sections/` (14 files).
  New test `preamble instructs the model to treat user text as data only
  (BUG-account-tier-custom-instructions-render-as-system-message-wi)`
  asserts the data-only preamble precedes the marker open tag.
- [x] Documentation updated — this ticket + the in-code JSDoc on
  `wrapUntrusted` (in `system.ts`) explicitly references the BUG and
  warns against future drift.

## Followups

- `reorderPromptMessages splices system messages to the front` is a
  separate concern (the bug ticket mentions it) — account-tier text
  already lands adjacent to GM system text by virtue of `role:'system'`,
  but the **preamble** is now what defends the boundary, not message
  order. If reorder behavior changes, the wrapper is still the
  authoritative sandbox.
- `reconcile obey-vs-obey-data semantics for steering` — the section
  text says "Follow these user steering instructions for every reply",
  which is intentionally a **user instruction** that the model obeys
  as a steering preference (style, tone, vocabulary) — distinct from
  obeying the inner text as commands (which the preamble forbids). The
  two obey semantics are layered: obey the wrapper's data-only rule,
  obey the steering as a preference. Documented in the JSDoc.
- The two-tier ticket referenced in the BUG should be updated to record
  the GM-vs-user trust boundary explicitly; that work is owned by the
  TASK-two-tier-custom-instructions ticket, not here.
