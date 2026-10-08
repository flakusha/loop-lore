<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: listener-leak checker: exempt top-level module registrations from false positives

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Tags:** security, checker, false-positive

**Summary:**

~34 of ~90 `listener-leak` findings are `document.addEventListener` (and `window`/`globalThis`) calls at module TOP LEVEL — page-lifetime registrations with no teardown path by construction. `src/alpine/htmx.ts` alone has 14 such calls. The detector correctly identifies the registration without a teardown, but this is a false positive: top-level event listeners in a single-page application are intentionally registered once at module load and live for the page lifetime. No code change is warranted — the detector needs a policy exemption.

## Evidence

- `src/alpine/htmx.ts` — 14 top-level `document.addEventListener` calls at module scope, no matching `removeEventListener`.
- Additional top-level registrations across `src/` estimated ~20 more (total ~34).
- Total `listener-leak` findings: ~90.
- The detector pattern (register without teardown) is a genuine memory leak when used inside a component lifecycle, but is correct and intentional at module top level.

## Known ceiling

The per-receiver pairing mechanism added recently only works within a single file. Cross-module register/teardown pairs (e.g., register in `a.ts`, teardown in `b.ts`) still produce false positives. This ticket does NOT address that — it only covers top-level module scope registrations.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

## Options

**Option A (recommended):** Add a detector policy exemption for top-level module registrations (`listener-leak` category). Exempt registrations where the `addEventListener` call is at module scope and the receiver is `document`, `window`, or `globalThis`.

**Option B:** Mark the ~34 findings as `won't-fix` individually. High noise, not recommended.

**Option C:** Do nothing. ~34 false positives continue to appear in every run.

**Acceptance Criteria:**

- [ ] Detector policy updated to exempt top-level module-scope registrations for `document`/`window`/`globalThis` receivers
- [ ] ~34 false-positive findings cleared or reclassified
- [ ] Remaining true-positive findings (actual listener leaks inside functions) remain flagged
- [ ] Cross-module false positives tracked separately (out of scope for this ticket)
