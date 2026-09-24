<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: cascade abort signal is not threaded through — in-flight LLM call runs to completion after pause toggle

**Status:** done
**Severity:** high
**Priority:** high
**Effort:** medium
**Type:** BUG
**Files:** src/generation/auto-gen/group-cascade.ts:202-214; src/generation/auto-gen/auto-generation.ts:69-269

## Issue

`triggerGroupCascade` fires `triggerAutoGeneration` without passing an abort signal. When a user toggles pause mid-cascade:

1. The in-flight LLM call runs to completion (cost incurred, tokens burned).
2. After the LLM returns, `group-cascade.ts:223-234` re-checks `isPaused` and stops the **next** depth — but the current depth already completed wastefully.

The post-LLM re-check (added in the partial fix at commit 359a3d3) prevents the cascade chain from continuing; it does not prevent the in-flight generation from completing.

`startGenerationTracking` (`cancellation-tracker/lifecycle.ts`) returns `{ abortSignal }`, but `triggerAutoGeneration` never accepts a `signal` parameter and `triggerGroupCascade` has no signal to pass.

## Why it matters

Cost + UX. Pause is a user-visible emergency stop. The user's intent is to stop generation immediately, not after the current tokens are billed.

## Evidence

- `src/generation/auto-gen/auto-generation.ts:89-269` — `triggerAutoGeneration` has no signal parameter; `callLlm` receives `tracking?.abortSignal` only when a tracking record exists.
- `src/generation/auto-gen/group-cascade.ts:202-214` — `triggerAutoGeneration` is called with no signal field.
- `src/generation/cancellation-tracker/lifecycle.ts` — `startGenerationTracking` returns `{ abortSignal }`; signal is available but not threaded through the cascade path.

## Concrete fix

1. Add `abortSignal?: AbortSignal` to `AutoGenOpts` (`auto-generation.ts:31-58`).
2. Thread `abortSignal` from `triggerGroupCascade` → `triggerAutoGeneration` → `callLlm` → provider.
3. In `triggerAutoGeneration`, start generation tracking when `parentMessageId` exists even for cascade calls so the signal is live.
4. In `group-cascade.ts`, after `triggerAutoGeneration` returns, check `abortSignal.aborted` in addition to `isPaused` — if aborted, stop cascading without billing the next depth.

## Existing ticket check

`BUG-group-cascade-mid-cascade-pause-ignored.md` — **RESOLVED**. The resolution fixed the post-LLM re-check and the silent error catch. It did **NOT** address the abort-signal threading for in-flight interruption. This is a distinct symptom.

## Tests

```ts
it("aborts in-flight generation when pause is toggled mid-cascade", async () => {
  // Start cascade at depth=0, toggle pause after first LLM starts but before it returns.
  // Verify: (1) in-flight generation receives abort signal, (2) only 1 AI message stored.
});
```


git issue: 753feef

**Summary:** `triggerGroupCascade` fires `triggerAutoGeneration` with no abort signal, so pausing mid-cascade lets the in-flight LLM call run to completion.
**Context:** `src/generation/auto-gen/group-cascade.ts`; `src/generation/auto-gen/auto-generation.ts`; abort signal available from `src/generation/cancellation-tracker/lifecycle.ts`.
**Acceptance Criteria:** pause toggled mid-flight aborts the in-flight provider call; cascade stops at the aborted depth; no extra depth is billed after abort; existing cascade tests unaffected.
