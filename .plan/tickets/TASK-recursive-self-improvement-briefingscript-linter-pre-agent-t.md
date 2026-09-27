<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: BriefingScript Linter — Pre-Agent Ticket Quality Gate

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)

**Status:** Not Started
**Priority:** Medium
**Effort:** (set per-ticket)
**Type:** Feature Task / Input Quality
**Tags:** briefingscript, sase, ticket-lint, pre-agent, briefing, structured-spec, validator
**Epic:** epic-recursive-self-improvement

The SASE framework (Hassan et al., arXiv:2509.06216, June 2026) replaces ad-hoc prompt-pasting with the **BriefingScript** — a structured spec artifact that captures what-to-build, success criteria, architectural context, strategic advice, and known gotchas. The **Watanabe 2026 study of Claude Code** (cited in SASE §3.4) found that **83.8% of agent-authored PRs are eventually merged** when supplied with a clear briefing — but the briefing itself is informal today. The Anthropic RSI essay (May 2026) identifies **research-direction-setting** as the load-bearing human bottleneck; the loop-lore equivalent is "what does a ticket ask for?".

This ticket adds a **pre-agent BriefingScript linter** for `.plan/tickets/` — a deterministic validator that grades tickets on the five SASE axes (What & Success Criteria, Architectural Context, Strategic Advice, Gotchas, Testability) and produces a score + targeted improvement suggestions.

## Why

The recursive-self-improvement agent (#5 router) consumes `.plan/tickets/<slug>.md`. Today the only validation is `bun run plan:validate` (linkage, naming, SPDX header, code-map). **It does not check whether the ticket tells the agent what to do.** When a `giwt ticket` call lands with only "fix the bug" + a hash, the agent has to infer everything from the bug ticket and the codebase — high-cost, low-success-rate. The BriefingScript linter is the cheap deterministic gate that turns "the ticket is structurally valid" into "the ticket is *agent-actionable*".

## Core Features

- `src/plan/briefing-linter.ts` — consumes a ticket markdown, returns:
  - `axes.what`: detects presence of `## Summary` + `## Acceptance Criteria` + at least one verifiable checkbox
  - `axes.context`: detects `## Context` section + cross-references to epics, tickets, source files (via `src/...` paths or `epic-...` mentions)
  - `axes.strategy`: detects `## Notes`, `## Implementation`, or explicit `## Strategic Advice` section; flags if missing
  - `axes.gotchas`: detects `## Risks`, `## Notes / Verification`, or explicit `## Gotchas` section
  - `axes.testability`: requires Acceptance Criteria checkboxes; bonus for measurable thresholds ("≤500ms", "≥3 results", "<5s")
  - `score`: 0-5, one point per axis
  - `verdict`: `actionable` (≥4) | `marginal` (3) | `reject` (<3)
  - `suggestions`: per-axis one-line suggestion ("Add `## Context` linking to epic-resource-provision.md"; "Replace 'fix it' with a testable acceptance criterion")
- `scripts/check-briefing.ts` — gate: runs over every ticket in `.plan/tickets/` (excluding `index.json`, `*help*`, `BUG-*` for backwards-compat), produces a per-ticket score table + per-file `warn|fail`
- `bun run plan:validate:briefing` — new CLI; called by `bun run plan:validate` and by the agent router (#5) before accepting a new task
- `bun run plan:lint-briefing <ticket>` — interactive one-ticket lint for human ticket authors
- Gate default: **warn** for `marginal`, **fail** for `reject`. Override via env `BRIEFING_GATE=off|warn|fail`
- The linter reuses `src/utils/extract-mdc-sections.ts` patterns if present; otherwise uses a minimal regex over the ticket's section headers

## Acceptance Criteria

- [ ] `bun run plan:validate:briefing` runs against all current tickets; produces a score table
- [ ] `BRIEFING_GATE=fail` fails CI when any ticket scores <3
- [ ] Each scoring axis has a deterministic unit test (10 tickets × 5 axes = 50+ cases)
- [ ] The linter suggests ONE specific improvement per missing axis (no "improve your ticket" hand-waving)
- [ ] `bun run plan:lint-briefing TASK-test-untested-routes` returns the same score as the batch run for the same ticket
- [ ] Linter runs in <200ms per ticket on the current `.plan/tickets/` corpus (cold cache)
- [ ] Integration: the agent router (#5) returns `409 Conflict` on a task submission whose ticket scores <3 unless `force=true`

## Files

- `src/plan/briefing-linter.ts` — new
- `src/plan/briefing-linter.test.ts` — new
- `scripts/check-briefing.ts` — new
- `scripts/check-parallel.mjs` — register `briefing` gate (warn default)
- `bun run plan:validate` — invoke `check-briefing.ts` after the existing gates
- `package.json` — add `plan:validate:briefing`, `plan:lint-briefing`
- `src/agent/api/router.ts` — extend to score ticket before accepting task (#5)
- `docs/ops/briefing-lint.md` — new (scoring rubric + suggestion heuristics)

## Notes / Verification

- **Reference pattern**: SASE BriefingScript §4.2.1 of arXiv:2509.06216. The five axes we adopt map directly to SASE's "What & Success Criteria / Architectural Context / Strategic Advice / Potential Gotchas / BriefingScript as durable artifact".
- **Why pre-agent**: deterministic gates are cheap (no LLM call); they run before the expensive agent invocation. This is the **evaluator reliability** principle from the UCR survey (arXiv:2607.07663, §5): the strongest signals are the formal/test rung, not the LLM-judge rung. Lint = test rung.
- **What NOT to do**: do NOT add LLM-based ticket grading. The agent should NEVER be the judge of its own input — that is the **self-confirming loop** failure mode (UCR §5.4). Keep the linter heuristic + regex + section detection only.
- **Backwards-compat**: BUG tickets score low on the strategic-advice axis (they're symptoms, not plans). Treat BUG-* as exempt from the strategy axis, required only on what + gotchas. Document this exemption.
- **Cross-reference detection**: regex `\.(md|ts)`, `epic-[a-z0-9-]+`, `src/[a-z0-9-/.]+`. Anything more sophisticated (semantic search) is P6+.
- **Threshold calibration**: run the linter against the **existing** ticket corpus (`epic-recursive-self-improvement` tickets + recent BUGs + recent FEATs); publish the distribution in `docs/ops/briefing-lint.md`. Calibrate the `<3` threshold to flag ~10% of current tickets, not 50% (linter calibration is a known failure mode in static-analysis tools).

## Risks

- **Threshold too strict**: linter rejects good tickets and adds friction. Mitigation: ship `BRIEFING_GATE=warn` as the default; `=fail` opt-in.
- **Threshold too loose**: linter is noise. Mitigation: weekly gate-output review by a human (or watchdog) for the first month; calibrate against actual merge rate vs linter score.
- **Section-name drift**: a future ticket uses `## My Notes` instead of `## Notes`; linter misses it. Mitigation: detect by *content pattern* (acceptance criteria checkboxes, source-file mentions) first, section-name fallback second.
- **Cross-cutting scope**: linter runs on BUG tickets too. Mitigation: BUG exemption for the strategy axis; gate still requires acceptance criteria.

