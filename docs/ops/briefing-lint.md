<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BriefingScript ticket lint

Deterministic pre-agent quality gate for `.plan/tickets/*.md`. It scores whether a ticket tells an agent what to build; it does not judge correctness or call an LLM. Scorer: `src/plan/briefing-linter.ts`.

## Usage

```bash
bun run plan:validate:briefing                    # score every ticket
bun run plan:lint-briefing TASK-test-untested-routes  # one ticket (slug or path)
BRIEFING_GATE=fail bun run plan:validate:briefing # make rejects fatal
```

`BRIEFING_GATE` accepts `off` (table only), `warn` (default), and `fail`. In `warn` mode marginal and rejected tickets print warnings but exit 0. In `fail` mode rejected tickets (score < 3) print errors and exit 1; marginal tickets remain warnings. `BUG-*` tickets, `index.json` and filenames containing `help` are skipped in batch mode.

## Rubric

| Axis | Signal | Missing-axis suggestion |
|---|---|---|
| what | non-empty Summary + Acceptance Criteria with a checkbox | add both sections and a verifiable checkbox |
| context | Context section with an `epic-…`, `src/…` or `.md` cross-reference | link the owning epic or source path |
| strategy | Strategic Advice / Implementation / Notes section | describe the approach (BUG tickets exempt) |
| gotchas | Risks / Gotchas / Notes / Verification section | record the known failure mode |
| testability | Acceptance Criteria checkbox; measurable threshold advised | add a checkable, bounded criterion |

One point per axis. Verdict: `actionable` at 4–5, `marginal` at 3, `reject` at 0–2. Each rejected axis contributes one concrete suggestion; the linter never emits a generic "improve this ticket" message.

BUG tickets are exempt from the strategy axis: a symptom report is not expected to carry an implementation plan. They still need what, context, gotchas and testability.

## Design notes

- Section detection accepts `## Heading` and `**Field:**` forms and falls back to content patterns, so generated tickets are scored without a naming convention migration.
- `(none captured)` and whitespace-only bodies count as empty. Duplicate headings score the first match: malformed tickets fail closed.
- A numeric count (`3 tests`, `≥3 results`, `≤500ms`) is a measurable threshold.
- The scorer is pure and side-effect free. Gate wiring, CI registration and agent-router enforcement are separate slices; this release is an operator-invocable CLI only.
- Calibrate before making `fail` the default: a strict threshold on the existing corpus adds friction instead of signal. Review gate output periodically rather than lowering the threshold to silence it.