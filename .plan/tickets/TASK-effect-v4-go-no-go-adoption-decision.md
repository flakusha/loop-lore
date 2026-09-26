<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Effect v4 go/no-go adoption decision

**Summary:** Terminal decision ticket — record an ADOPT/ADOPT-SUBSET/REJECT verdict for each of the ten Effect pillars, backed by the spike measurements, and close the epic.
**Context:** Epic epic-effect-v4-adoption-evaluation. The default expectation is mostly reject; a "no" is a complete and valid outcome. Fold in the existing OpenTelemetry evaluations rather than re-running them.
**Acceptance Criteria:** See ## Acceptance Criteria below — all ten pillars carry a verdict with its driving number, every REJECT names its alternative, every ADOPT names a migration owner, the RC-risk statement is written, and the epic Status is updated.


**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Epic:** epic-effect-v4-adoption-evaluation
**Tags:** effect, evaluation, decision, go-no-go

## Summary

Spike S5 — the terminal decision ticket for
`epic-effect-v4-adoption-evaluation`. Reads the spike results, records a
go/no-go per pillar with the measured numbers behind it, and closes the epic
either way.

**A "no" is a complete, valid outcome of this epic.** The default expectation,
recorded up front, is mostly reject. The spikes exist to overturn that with
evidence, not to confirm it. Do not manufacture a "go" to justify the work.

## Inputs

| Spike | Ticket | Status required |
| ----- | ------ | --------------- |
| S1 compatibility | `TASK-effect-v4-bun-esm-typecheck-compatibility-spike` | PASS — a FAIL closes the epic here and S2–S4 are moot |
| S2 retry parity | `TASK-effect-v4-retry-schedule-parity-spike-on-the-provider-call-p` | measured |
| S3 concurrency | `TASK-effect-v4-scoped-concurrency-and-interruption-spike` | measured |
| S4 DI wiring | `TASK-effect-v4-di-wiring-spike-versus-the-handleopts-bag` | measured |

Also fold in — do not re-run — the existing OpenTelemetry evaluations, which
cover the one genuinely missing pillar (spans) more cheaply:
`TASK-evaluate-elysia-opentelemetry.md` and
`TASK-evaluate-elysiajs-opentelemetry-versus-custom-telemetry-modu.md`.

## Required output

One row per Effect pillar, each exactly one of:

- `ADOPT` — measured net win on that surface; a follow-up epic scopes the migration.
- `ADOPT-SUBSET` — one operator (e.g. `Schedule`) is worth importing without adopting the Effect type.
- `REJECT` — Effect loses to the status quo or to a cheaper alternative; **name what ships instead**.

All ten pillars from the epic's assessment table must appear, including the
four already ruled out (streaming, schema, configuration, HTTP). "Not
revisited" is not a verdict.

## Acceptance Criteria

- [ ] Every one of the ten pillars carries a verdict (`ADOPT` / `ADOPT-SUBSET` / `REJECT`) with the measured number that drove it
- [ ] Every `REJECT` names the alternative that ships instead
- [ ] Every `ADOPT` names the follow-up epic that will scope the migration — no adoption is recorded without a migration owner
- [ ] The *Spike Results* table in `epic-effect-v4-adoption-evaluation.md` is filled in with final numbers
- [ ] The existing OpenTelemetry tickets' outcomes are folded in, not duplicated
- [ ] A statement is recorded on the RC risk: whether any adopted surface depends on a v4 release-candidate API, and what happens on the next breaking RC bump
- [ ] The epic's `Status` is set to reflect the outcome, and this ticket is closed with the decision recorded in a `## Resolution` section

## Files

- `.plan/epics/epic-effect-v4-adoption-evaluation.md` — *Spike Results* table, pillar verdicts, `Status`

## Dependencies

- Blocked by: S1 (hard gate) + S2, S3, S4
- Reads: the four spike tickets above, plus the two existing OpenTelemetry evaluation tickets
