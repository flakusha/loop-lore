# BUG: creation wizard cancelWizard drops wizardId — API clarity + caller mismatch

**Status:** done
**Priority:** low
**Effort:** Trivial
**Area:** characters, frontend

## Symptom

`cancelWizard(_wizardId: string)` in `src/frontend/alpine/creation-wizard.ts` declared an unused parameter. Callers passed nothing meaningful (`wizardId` was always `""`), and the function ignored it. The companion `confirmWizard(wizardId)` *does* validate against `this.wizardDraft?.wizardId`, creating an asymmetry: confirm is defensive, cancel is not.

## Fix (commit 5dd6ff40)

`cancelWizard()` no longer takes a parameter. It now reads `this.wizardDraft?.wizardId` for logging and resets the draft. Callers in `src/components/chat/wizard-panel.html` updated to call `cancelWizard()` with no argument.

## Verification

`src/frontend/alpine/creation-wizard.test.ts` covers the new signature; the wizard-panel partial carries the updated call.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated
