<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: license compliance check inert — check-parallel emits info skip when scancode and fossa absent

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Tags:** licensing, compliance, plan-hygiene

**Summary:**

`bun run check` reports `[license] Neither scancode nor fossa installed - skipping` at info level on every run. The LGPL purity of `src/` is therefore enforced by nothing — the check silently passes whether or not the license constraints are satisfied.

`.plan/FILING-BATCH-NOTES.md:12` explicitly marks this as "NOT a defect", citing `check-parallel.mjs:1263-1290` as the source. The statement is correct as a description of current behavior, but creates a contradiction: the compliance gate exists, runs on every CI invocation, and produces an info-level skip — yet the batch notes treat it as acceptable.

## Evidence

- `check-parallel.mjs:1263-1290` — emits `level: info` with message "Neither scancode nor fossa installed - skipping".
- `scripts/check-parallel.mjs` gate `license` — runs on every `bun run check`.
- `TASK-LICENSE-COMPLIANCE-GATE` (3e4b342, Done) — closed with the assumption that the gate is informational only.
- `.plan/FILING-BATCH-NOTES.md:12` — records P-11/L-8 as "NOT a defect".

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

## Options

**Option A:** Upgrade the license gate from `info` skip to `warn` or `error` when scancode/fossa are absent. Makes the gap visible. Appropriate if LGPL enforcement is genuinely required.

**Option B:** Remove the license gate from `check` entirely (it enforces nothing). Eliminates the misleading output.

**Option C:** Keep as-is (info skip) but update `FILING-BATCH-NOTES.md` to remove the "NOT a defect" framing, replacing it with a decision record that the gate is intentionally informational.

**Option D:** Document expected tooling (scancode/fossa should be installed in CI) and add a gate that fails when they are absent.

## Recommendation

Option A or D — the gate should fail meaningfully if license compliance is a real requirement. Option B is appropriate only if LGPL purity is not currently enforced.

**Acceptance Criteria:**

- [ ] Decision made among Options A–D
- [ ] If Option A or D: gate behavior updated to fail or warn when tools absent
- [ ] `FILING-BATCH-NOTES.md` updated to reflect the decision
- [ ] `bun run check` output is consistent with the decision
