<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Browser e2e asserts absence of a decrypt-failure marker across the whole page body

**Status:** Done
**Status Note:** fixed on dev (commit afeb16b88, "stabilize three browser flows that flake under load") — `tests/e2e/flows/browser/encryption-flow.browser.ts` scopes the decrypt-failure read to the secret's own bubble (`xpath=ancestor::div[contains(@class,'bubble')][1]`) instead of `document.body.textContent`, so a sibling bubble's decrypt failure can no longer fail this assertion. Verified 2026-10-04.
**Priority:** high
**Effort:** Medium

**Summary:**

The assertion is `expect(bodyText).not.toContain("[Encrypted — unable to decrypt]")` where `bodyText` is read from `document.body.textContent` — the ENTIRE page. Any other bubble's decrypt failure anywhere on the page trips it, so the test fails for a reason unrelated to the secret it is about. The same file already scopes correctly for its DB assertion at `tests/e2e/flows/browser/encryption-flow.browser.ts:159-167`; the text read needs the same scoping.

Measured: this file failed 2 of 2 runs once, then passed, then failed 1 of 2 — nondeterministic under identical conditions (same worktree, same code, same env). Observed 2026-10-01 during a finalize sweep.

Fix direction: scope the read to the secret's own row/bubble rather than the body. Do not fix by widening to a retry-only assertion that still reads the whole body.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
