<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: N-Version Patch Arena — Cross-Reference Candidate Patches Against the Deterministic Evaluator

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)

**Status:** Not Started
**Priority:** High
**Effort:** (set per-ticket)
**Type:** Feature Task / Agent Loop
**Tags:** n-version, patch-arena, sase, agentic-se, evaluation, candidate-ranking, cross-reference
**Epic:** epic-recursive-self-improvement

The SASE framework (Hassan et al., arXiv:2509.06216, June 2026, §4.1) demonstrates the **N-version programming** pattern applied to agentic SE: a single ticket yields 4 candidate PRs; the human coach selects the merge-ready one or refines the briefing. The Watanabe 2026 study (cited in SASE §3.4) found that **agent PRs with multiple candidates are merged at higher rates** because the alternatives serve as a built-in diff. The UCR survey (arXiv:2607.07663, §5) lists **diversity collapse** as a top failure mode — agents converge on the same fix every run because the search is narrow. Both point at the same need: **a deterministic arena that ranks N candidate patches against the gate suite, with cross-reference scoring**.

This ticket implements the N-version arena. The agent loop (#5–#9) submits N patches; the arena runs `bun run check` against each, scores by MRP axes (ticket #16), and selects the **highest-evidence** patch (or refuses to merge if all fail). The decision is auditable, deterministic, and grounded in the gate suite — not in an LLM judge's preference.

## Why

Today's agent loop commits one patch per `giwt commit-wt`. If the patch is suboptimal, the agent has to re-investigate. With N=4 candidates, the cost of generation grows linearly but the probability of merge-ready success grows superlinearly (the SASE §4.1 anecdote: 28 PRs across 7 tickets, the developer picked the best 7). Loop-lore's existing infra (`bun run check`, worktree isolation per agent run) supports N-version naturally — we run `bun run check` in each of N worktrees, score by MRP, surface to the human-on-the-loop reviewer.

## Core Features

- `src/agent/arena/` directory:
  - `arena.ts` — orchestrator: given a task + N candidate patches, spawns N worktrees, runs `bun run check:mrp` in each, collects MRPs, ranks
  - `ranking.ts` — deterministic score: `MRP.verdict` → base score (`ready`=100, `ready-with-caveats`=50, `blocked`=0); tiebreakers by axis scores, then by diff size (smaller wins on ties)
  - `diversity.ts` — computes Jaccard similarity between candidates' diffs; flags when all candidates converge (diversity collapse, per UCR §5.4); arena fails-fast in that case and re-spawns with temperature jitter
  - `referee.ts` — picks the winning MRP; emits a `Merge-Readiness Pack (final)` combining the winning patch + the loser's evidence (what the losers got wrong — adds to `axes.rationale`)
- `POST /api/v1/agent/arena` route: `{ task: BriefingScript, candidates: Array<{ patchUrl, summary }>, minDiversity?: number }`
- `src/agent/api/sandbox.ts` extension: arena limited to N≤4 candidates per task (default 3); cost budget per task (sum of MRP gate wall-clock)
- The arena **never auto-merges** — it picks a winner; the human-on-the-loop (the `giwt finalize` operator, per the worktree finalize flow) makes the final call. The MRP carries the recommendation.
- Audit-logged to `agent_actions` (#9) with `action = 'arena.run'` + per-candidate scores + winning rationale
- Replay mode: re-run an arena on a frozen task; result is deterministic (same MRP scores, same winner) — covered by golden test

## Acceptance Criteria

- [ ] `POST /api/v1/agent/arena` accepts N candidates (N ≤ 4), runs `bun run check:mrp` in each, returns ranked MRPs + winner
- [ ] Arena wall-clock ≤ N × (smoke gate wall-clock) + 60s overhead; default N=3 → ≤4 min on a clean tree
- [ ] Deterministic: re-running the arena on the same task produces the same winner (golden test)
- [ ] Diversity collapse detection: if all candidates have Jaccard similarity >0.85, the arena refuses + suggests temperature jitter
- [ ] Tie-breaker: when two MRPs have equal scores, the smaller diff wins; if diff sizes tie, the candidate with the broader test surface wins
- [ ] Final MRP includes "loser evidence" — what each losing patch failed on — so a human reviewer sees the comparison
- [ ] Arena respects the watchdog (#1) state: if the watchdog is in `degraded` mode, the arena refuses to run with a 503 (don't pile work on a sick instance)
- [ ] Cost budget enforced: if MRP generation exceeds the task's budget, the arena stops mid-run and reports which candidates completed

## Files

- `src/agent/arena/{arena,ranking,diversity,referee,types}.ts` — new
- `src/agent/arena/arena.test.ts` — new (golden test + diversity-collapse detection)
- `src/agent/api/arena.ts` — new (route)
- `src/agent/api/sandbox.ts` — extend with `agent:arena` scope + per-task budget
- `src/agent/arena/diversity.ts` — new (Jaccard on diff line sets)
- `scripts/arena-smoke.ts` — new (CLI: runs arena against 3 synthetic patches; gates green)
- `docs/ops/agent-arena.md` — new (arena lifecycle, scoring formula, diversity detection rationale)
- `docs/spec/agent-loop.md` — update §3 with arena step

## Notes / Verification

- **Reference**: SASE §4.1 (N-version programming) + §4.2.4 (MRP). Loop-lore's gates become the **deterministic judge** of the candidate set — a strong move because the UCR survey §5 ranks test/verifier signals above LLM-judge signals.
- **Diversity-collapse detector**: Jaccard on diff line sets. Compute `|A ∩ B| / |A ∪ B|` per candidate pair; flag if all pairs >0.85. The 0.85 threshold is empirical — calibrate against the first 5 arena runs in production.
- **Why not auto-merge**: the UCR survey §5.4 explicitly warns against self-confirming loops. The arena picks the winner; a human (or the gated finalize flow) signs off. The MRP carries the evidence; the sign-off carries the accountability.
- **Why N≤4**: SASE's example uses 4 candidates; loop-lore's compute budget suggests N=3 default. Beyond N=4, the marginal MRP-evidence gain drops below the linear cost growth.
- **Cost model**: each MRP run is `bun run check:mrp` (smoke gate + report). Budget = N × smoke wall-clock + 60s overhead. Surface budget per task in the arena API request.
- **Watchdog integration**: the watchdog (#1) `degraded` state is a circuit-breaker for the arena. Document the state machine in `docs/ops/agent-arena.md`.

## Risks

- **Compute cost**: N× smoke runs are not free. Mitigation: only run the arena for non-trivial tasks; trivial bug fixes use the existing single-patch flow.
- **Diversity collapse false positive**: a bug with one obvious fix legitimately has low diversity. Mitigation: low-diversity is OK when the patches all score 100 (same correct fix). Flag only when score < 100.
- **Tie-breaker gaming**: a malicious agent could submit patches with deliberately small diffs. Mitigation: MRP covers the diff surface; agent trust score (future ticket) can deprioritize untrusted tokens.
- **Arena starvation**: a long-running arena blocks the agent API. Mitigation: arena runs in a dedicated subprocess with its own timeout; main API returns 202 Accepted + arena_id.
- **Replay drift**: if the gate suite is non-deterministic, golden tests fail. Mitigation: the drift detector (ticket #18) catches non-determinism; arena replays must be run on a tree where drift = 0.

