<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Merge-Readiness Pack Generator from Check-Report JSON

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)

**Status:** Not Started
**Priority:** Medium
**Effort:** (set per-ticket)
**Type:** Feature Task / Evaluator Reliability
**Tags:** merge-readiness-pack, mrp, sase, briefing, evaluator, evidence, gate-report
**Epic:** epic-recursive-self-improvement

The SASE framework (Hassan et al., arXiv:2509.06216, June 2026) names the **Merge-Readiness Pack (MRP)** as the structured artifact that bridges agent-generated code and human merge confidence. Five evidence axes: functional completeness, sound verification, exemplary SE hygiene, clear rationale, accountability. **SWE-bench Verified Sep 2026**: 29.6% of "plausible" agent fixes have behavioral regressions; passing tests is necessary but not merge-ready. The check report `bun run check` emits is the **raw material** for an MRP — but it's machine-greppable stdout, not the evidence bundle a human reviewer (or downstream agent) can audit in seconds.

This ticket wraps `bun run check` output in an MRP schema: per-axis evidence, signatures, hashes, and a "ready / ready-with-caveats / blocked" verdict that the agent loop (#5–#9) consumes before opening a finalize.

## Why

Today `scripts/check-parallel.mjs` writes `.tmp/check-report.json` (canonical provenance: branch, gitHead, runId, mode, per-check pass/fail/skip). It is greppable by CI but not by an MRP-aware consumer. A watchdog-triggered or agent-triggered `bun run check` produces a JSON the agent treats as opaque — it has to re-parse stdout to figure out "did lint actually pass?". The MRP is the structured **what passed / what didn't / what is risky** payload.

## Core Features

- `src/check/mrp.ts` — consumes `.tmp/check-report.json` + emits `.tmp/check-report.mrp.json` with:
  - `axes.functional`: per-module test count, delta vs prior run, suspicious-pass detection (test runs in <50ms when prior median is >500ms = suspicious)
  - `axes.verification`: coverage delta per module + uncovered-critical-path warnings (from `scripts/check/coverage.mjs` floor violations)
  - `axes.hygiene`: lint, typecheck, size-strict, md-lint, dprint, wiring, migration-ordering, changelog — with per-axis pass/fail
  - `axes.rationale`: linked `BriefingScript` (ticket hash), prior MRP hash (if this is a re-run), agent trace_id
  - `axes.accountability`: signed by `giwt` worktree commit hash; reviewer-tokens list (empty if auto-merge)
  - `verdict`: one of `ready` | `ready-with-caveats` (degrades, must explain) | `blocked` (any axis fails)
  - `evidence_refs`: file:line anchors for each axis claim (the loop-lore `read` tool supports this via `:N-M` ranges)
- `src/check/mrp.ts` is **deterministic** — same check-report → same MRP hash. Add a unit test with a fixed fixture.
- `bun run check:mrp` — new CLI: runs `bun run check`, then wraps output into MRP. Single command.
- `scripts/check-mrp-schema.ts` — JSON-schema gate: any drift in MRP shape fails the `mrp` gate (added to `check-parallel.mjs`)
- Integration with `agent_actions` (#9 in epic): when an agent opens a session, the MRP from its check-stream is persisted alongside the action record

## Acceptance Criteria

- [ ] `bun run check:mrp` produces `.tmp/check-report.mrp.json` with all five axes populated for a clean run
- [ ] MRP hash is deterministic (golden test against a frozen fixture)
- [ ] `verdict` field is `ready` only when every axis is green; `ready-with-caveats` lists the degraded axes with one-line explanation; `blocked` if any axis fails
- [ ] Coverage-floor warning: an MRP for a module that newly breaches `coverage.mjs` floor is `ready-with-caveats` with `evidence_refs` pointing at the coverage report
- [ ] `bun run check --gates mrp` runs the MRP-schema gate; `mrp` is registered in `scripts/check-parallel.mjs`
- [ ] MRP persists under `tree/.tmp/agent-data/<trace_id>/mrp-<run_id>.json` when called from the agent API (#5)
- [ ] Suspicious-pass detector fires on a synthetic test fixture (a <50ms test against a >500ms prior median) — verified by a unit test with a fake timer

## Files

- `src/check/mrp.ts` — new
- `src/check/mrp.test.ts` — new
- `scripts/check-mrp-schema.ts` — new
- `scripts/check-parallel.mjs` — register `mrp` gate
- `scripts/check-mrp.ts` — new (CLI wrapper, calls `bun run check` then `src/check/mrp.ts`)
- `package.json` — add `check:mrp` script
- `docs/ops/mrp.md` — new (schema reference, verdict rules, evidence_refs conventions)
- `src/agent/api/check.ts` — extend to persist MRP under trace_id

## Notes / Verification

- **Reference pattern**: SASE MRP §4.2.4 of arXiv:2509.06216. We map "Merge-Readiness Pack" → loop-lore's `bun run check` evidence; the five SASE axes map to loop-lore's existing gates.
- **Verification hierarchy** (UCR survey §5, arXiv:2607.07663): formal verifier > test > judge > intrinsic. loop-lore's gates sit in the **test** rung (deterministic, executable). The MRP is **not** in the verifier rung — it is a **structured packaging** of verifier output. Do NOT skip gates; do NOT make the MRP self-judge.
- **Self-confirming loops**: the UCR survey §5.4 names "self-confirming loops" as the top failure mode for closed-loop RSI. The MRP does NOT close the loop — a human (or higher-tier verifier) signs it. The agent never sees `verdict: ready` as permission to merge without the worktree's GPG-signed commit on `dev`.
- **Suspicious-pass detection**: cite Anthropic's "Evaluation Awareness" research (Claude 4 system card, May 2026) — agents learn to game the evaluator. The detector flags *too-fast* or *too-uniform* test results; not a complete defense but a cheap signal.
- **Determinism**: the MRP generator must use the same `JSON.stringify` ordering + field selection across runs. The golden fixture test catches drift.

## Risks

- **Schema drift**: adding new gates means updating the schema gate. Mitigate by making the schema gate warn-then-error on unknown axes (not error-on-unknown).
- **Over-trust**: the MRP can mislead if a reviewer only reads the verdict. Document the **per-axis evidence_refs** in `docs/ops/mrp.md` as the primary reading path.
- **Coverage-floor false positives**: a coverage delta warning on an unrelated test refactor is noise. Add a `--mrp-quiet` flag for routine runs.
- **No format export to PDF/markdown yet**: the MRP is JSON only. A follow-up ticket can add a `bun run check:mrp:render` for human-readable output.

