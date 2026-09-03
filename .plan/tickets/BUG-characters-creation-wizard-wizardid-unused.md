<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: creation wizard confirmWizard ignores wizardId — cross-talk risk

**Status:** Done
**Priority:** medium
**Priority Tier:** P3
**Effort:** Small
**Area:** characters
**Source:** reconcile review (Scout Batch C — CHAR-3)

## Evidence

`src/frontend/alpine/creation-wizard.ts:33-128` — `confirmWizard(wizardId)` receives `wizardId` but never uses it to look up wizard state. Uses global/current state instead.

```ts
confirmWizard(wizardId: string) {
  // wizardId is never used — reads from global state
  const wizard = this.wizard; // wrong wizard if multiple exist
}
```

## Impact

Creating multiple entities in parallel (character + world) causes cross-talk between wizard states; the wrong wizard state may be committed.

## Fix

Use `wizardId` as a key:

```ts
confirmWizard(wizardId: string) {
  const wizard = this.wizards[wizardId]; // keyed lookup
  if (!wizard) return;
  // ...
}
```

## Verification

- Unit test: two concurrent `confirmWizard("wiz1")` and `confirmWizard("wiz2")` → each commits correct state.

## Acceptance Criteria

- [ ] `confirmWizard` uses `wizardId` as lookup key
- [ ] Concurrent wizards don't cross-talk

## Resolution

Resolved in `creation-wizard.ts`. `confirmWizard(wizardId)` now validates `this.wizardDraft?.wizardId !== wizardId` and logs at warn + returns on mismatch. The draft is the active single slot (not keyed), so concurrent wizards serialize on the slot; cross-talk is prevented by the guard rather than by lookup.
