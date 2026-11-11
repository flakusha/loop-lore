<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: EPIC release-1.0.0

**Status:** Not Started
**Priority:** high
**Effort:** Medium

**Summary:**

Release 1.0.0 roadmap tracker. Thesis: an operator can install loop-lore, gate who runs what, import characters without silent loss, and run chat from a phone browser — with a finalize cadence fast enough to ship fixes the same day.

Theme tickets (this release scope):

1. TASK-1-0-0-theme-1-operator-correct-agentic-runtime-harness-ladde.md (issue 174eca7)
2. TASK-1-0-0-theme-2-card-portability-without-silent-loss-import-ex.md (issue 442dc3b)
3. TASK-1-0-0-theme-3-chat-as-the-product-scripting-lite-product-res.md (issue 97b0aae)
4. TASK-1-0-0-theme-4-mobile-ready-web-without-a-native-package.md (issue c137c78)
5. TASK-1-0-0-theme-5-frontend-completion-against-shipped-backends-c.md (issue bd1d1e4)
6. TASK-1-0-0-theme-6-release-cadence-fast-trustworthy-finalize.md (issue 0d91828)

Baseline: 374 epics (211 Not Started / 110 In Progress / 52 Done / 1 Postponed); 4486 tickets (~2650 open-like / ~1830 closed-like); 32% no usable epic pointer; no 1.0.0 epic (only epic-release-010 for 0.1.0); package.json 0.1.0; zero git tags.

Sequencing: theme 1 ladder rung (a) blocks all theme-1 3.3 features; theme-5 UI lands behind the finalize wave (p0-battle-ui, world-mgmt-gaps, edge-case-tests-20261101, synthetic-qa-capture); theme-2 tag routing ships in the normalizer lane; theme-4 PWA shell precedes budget work; theme-6 research-only.

Open questions for the operator:

1. Version/tag policy: v1.0.0 tag + package.json bump at approval or first RC?
2. Which of the 211 Not-Started epics are explicitly OUT of 1.0.0?
3. Status-vocab enforcement: hard gate now or advisory until R1 cleanup?
4. 2MB tickets/index.json split: before or after 1.0.0 scope?
5. Confirm thin-client-over-API as the 1.0.0 mobile answer?

Related: .tmp/research/release-1.0.0-roadmap.md

**Caveats:** TOCTOU: n/a, planning tracker. Security: n/a. Authorization: operator decides open questions. Parallelism: theme tickets proceed in sequence per roadmap §6. Partial failure: themes land independently. Rollback: n/a. Observability: this ticket tracks the six theme issues.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
