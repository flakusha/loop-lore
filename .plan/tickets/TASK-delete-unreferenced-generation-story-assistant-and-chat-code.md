<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Delete unreferenced generation, story, assistant and chat code (nsfw-context section needs an owner decision)

**Status:** Not Started
**Status Note:** [2026-10-26] EVIDENCE SOURCE GONE: this ticket cites `.tmp/simplification/*.md`, deleted by a .tmp cleanup on 2026-10-12 and never git-tracked (verified unrecoverable — see BUG-simplification-audit-artifacts-lost-to-a-tmp-cleanup-13-tick / dd8e139). Every count, finding number, or ranking taken from those citations is UNSOURCED; re-derive against the current tree before acting. The ticket's substance (file:line scope lists, MUST RETAIN lists, re-derive commands) stands on its own; only the audit citations dangle.
**Priority:** medium
**Effort:** Small
**Epic:** epic-assistant-generation-extensions

**Summary:**

Remove the commented-out policy-detector examples, the story back-compat shims, the unwired assistant prompt sections and assorted test-only exports. The nsfw-context section needs an owner call, not a blind delete. Research: the generation slice of the over-engineering audit (scratch, not on disk).

**Context:**

`bunx knip` reports zero issues on this repo but does **not** resolve `from "./foo.js"` specifiers to
`foo.ts`, which this codebase uses heavily — absence of a knip finding is not evidence a symbol is
used. Every item below was verified by direct grep across `src/`, `tests/`, `scripts/`, `plugins/`.
Source: the generation slice of the over-engineering audit (scratch, not on disk). Re-derive with `bun run dead:code:src`.

**Scope — deletions:**

- `src/generation/policy-detector.ts:136-225` — commented-out example implementations
  (`OpenAIModerationDetector`, `HttpPolicyDetector`). `git` tracks this history and
  `docs/research/03-llm-routing-and-safeguards.md` already records the intent.
- `src/story/turn-strategies.ts:1-19` — back-compat re-export shim with **zero** importers;
  `src/turning/turn-strategies.ts` is imported directly by `src/turning/index.ts:22`,
  `src/turning/turn-manager/selection.ts:7`, `src/chat/service/turn-order.ts:21`.
- `src/story/turn-manager.ts:1-13` — same shim pattern, but it has 3 importers
  (`src/story/index.ts:49`, `src/story/game-master/index.ts:25`, `src/story/game-master/types.ts:15`);
  repoint them at `../turning/turn-manager` first.
- `src/assistant/prompt/sections/character-traits.ts:1-87` — `characterTraitsSection` is never
  registered in any `SectionBuilder` list and never imported. Every live section
  (`recentEventsSection`, `actorGrowthSection`) also appears in `src/assistant/prompt/registry.ts`;
  this one does not.
- `src/chat/folders.ts:145-~155` — the `__test` escape hatch, a production-file export that exists
  only so tests can seed state directly. Seed via the public API instead.
- `src/aux-pipeline/eval/score.ts:45-47` — inline the 3-line `scoreFixture` (single caller at
  `score.ts:66`).
- Export-keyword-only cleanups (no behaviour change): `src/generation/scheduler.ts:41-44`
  (`resetSchedulerManager`, no callers at all), `src/assistant/commands/workflow.ts:69-107,131-160`
  (`formatWorkflowProgress`, `confirmSession` — both called only inside that file),
  `src/generation/transforms.ts:14` (`REGEX_TRANSFORM_PHASE_ORDER`), and
  `src/generation/tools/create-wizard-utils.ts:17` (`DEFAULT_WORLD_ID`),
  `src/aux-pipeline/eval/env.ts:24-37` (`EVAL_PROVIDER_NAME`, `EVAL_MODEL_ID`, type `EvalMode`).
  Safe to un-export for the same reason (defined and used entirely within one file):
  `src/generation/generate-route/tool-execution.ts:71` (`sanitizeToolOutput`) and
  `src/generation/hooks/nsfw-rating.ts:60` (`computeEffectiveLimit`).
- `shrink:` `src/story/items/effects.ts:70-72` — `resolveItemEffects` is a 3-line pass-through to
  `parseItemEffects` with zero call sites; call `parseItemEffects(item.properties.effects)` directly.
  `src/story/items/balance.ts:121-127,134-138` — `statDeltaTotal` / `driftTotal` are
  `Math.abs`-accumulator loops; collapse to `reduce`.

**Evidence:**

- `grep -rn "story/turn-strategies|from \"./turn-strategies\"|from \"../turn-strategies\"" src/ tests/ scripts/ plugins/`
  → every hit resolves to `src/turning/turn-strategies.ts`; none to `src/story/`.
- `grep -rn "characterTraitsSection" src/ tests/` → only the declaration at
  `src/assistant/prompt/sections/character-traits.ts:11`.
- `grep -rn "resetSchedulerManager" src/ tests/` → only the declaration at `scheduler.ts:41`
  (`scripts/check/test-gaps-baseline.json:780` is a generated inventory string, not an importer).
- `grep -rn "scoreFixture" src/ tests/` → declaration `score.ts:45` plus single use `score.ts:66`.
- `grep -rn "formatWorkflowProgress|confirmSession" src/ tests/` → only
  `src/assistant/commands/workflow.ts`.
- `grep -rn "__test" src/ tests/` → only `src/chat/folders.ts:146` in `src/` (other hits are
  unrelated `__test_*` tmp-dir constants in `src/config/*.test.ts`).

**CAVEAT — `nsfwContextSection` needs an owner decision, not a blind delete.**
`src/assistant/prompt/sections/nsfw-context.ts:1-105` is equally unreferenced
(`grep -rn "nsfwContextSection" src/ tests/` → only the declaration at line 14), so it is either
dead code or the wiring is missing. The audit explicitly flags this rather than asserting deletion:
the absence of this section from the prompt registry may itself be the bug, since it is *context* text
for NSFW, not a moderation call — removing it removes no gate, because it was never wired in. Get an
owner decision first (wire it or delete it); do not fold it into this change as a silent delete.

**Caveats / constraints:**

- Do NOT "simplify" the following — the audit verified them as correct shapes, not findings:
  `src/generation/providers/retry.ts` (already the consolidation that replaced three byte-identical
  backoff loops in `anthropic/http.ts`, `ollama-native/http.ts`, `openai-compatible/http.ts`);
  `src/story/gm/decisions/*` (3 of the 4 strategies are mapped onto the 3-member `GameMasterType`
  enum in `src/db/enums-config.ts:39-43`, with `hardcoded` as the fallback);
  `src/chat/world-invites/**` (verified by `diff -r` to genuinely reuse `src/chat/invites/**` core);
  `src/generation/gen-types-*.ts` and `src/generation/context-compressor/**`.
- **Do not touch `sanitizeToolOutput` beyond the `export` keyword** — it is prompt-injection
  hardening.
- If `src/story/turn-manager.ts` is deleted, its 3 importers must point at `src/turning/turn-manager`;
  verify `src/turning/turn-manager.test.ts:8` resolves to `src/turning/`, not `src/story/`.

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
