<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Effect v4 Bun/ESM/typecheck compatibility spike

**Summary:** Prove `effect@4.0.0-rc.117` installs, runs under Bun, and typechecks under tsgo strict without regressing a `bun run check` gate.
**Context:** Epic epic-effect-v4-adoption-evaluation. Hard gate for the whole epic: v4 is a release candidate (`latest` is still 3.22.2) with its ecosystem surface under `./unstable/*`. A probe already confirmed the RC *runs* under Bun 1.4.2; what remains unmeasured is whether it typechecks cleanly under this repo's tsgo strict config with `skipLibCheck` off. Read the epic's `v4 API actuality` section first — several v3 names are gone.
**Acceptance Criteria:** See ## Acceptance Criteria below — measured numbers recorded in the epic's Spike Results table, PASS/FAIL verdict written, no `package.json` change lands.


**Status:** Done
**Status Note:** PASS (2026-09-27, worktree effect-adoption-dedup) — installs, runs under Bun 1.4.2, typechecks under tsgo strict with no new `bun run check` failure; the feared typecheck risk never applied because the repo already sets `skipLibCheck: true`
**Priority:** medium
**Effort:** Small
**Epic:** epic-effect-v4-adoption-evaluation
**Tags:** effect, evaluation, spike, dependency-risk

## Summary

Spike S1 — the **hard gate** for `epic-effect-v4-adoption-evaluation`.

Prove (or disprove) that the `effect` package can be installed, imported, and
typechecked inside loop-lore under **Bun** + **tsgo strict**, without regressing
any `bun run check` gate. If it cannot, the epic closes as "no adoption" and
S2–S4 never run.

## Why this is first

Verified against the npm registry on 2026-09-26:

| Fact | Value |
| ---- | ----- |
| `latest` dist-tag | `3.22.2` |
| v4 line dist-tag | `rc` → `4.0.0-rc.117` |
| v4 package shape | ESM-only (`"type": "module"`), no `engines` field declared |

Adopting an RC whose ecosystem surface lives under `./unstable/*` is the single
largest risk in the epic. Price it before measuring anything else.

## Method

1. In an isolated `.tmp/effect-probe/` package (its **own** `node_modules` —
   the worktree symlinks the dev one, so `bun add` at the worktree root
   pollutes dev), add `effect@4.0.0-rc.117` and write a minimal program that
   exercises the pillars the epic cares about: `Effect.gen`, `Effect.retry` +
   `Schedule`, `Effect.forkScoped`, `Context.Service` + `Layer`, and
   `Effect.withSpan`.
2. Use **v4 names only**. `Effect.fork`, `Context.Tag`, `Tag.asEffect()`,
   `Effect.zipRight` are all gone in v4; `Effect.interrupt` and `Effect.void`
   are objects, not functions. See the epic's `v4 API actuality` table.
3. Run it under `bun`. Record whether the runtime works and the wall-clock
   overhead of entering `Effect.runPromise` on a trivial program.
4. Run `bun run typecheck` with the dependency present. Record whether tsgo
   strict survives the `.d.ts` surface. This is the one thing the existing
   probe did **not** establish — treat it as genuinely unmeasured.
5. Run `bun run check` and record the delta (cold-start time, memory, any new
   lint/typecheck failures).
6. Record the numbers in the epic's *Spike Results* table.

## Acceptance Criteria

- [ ] `effect@4.0.0-rc.117` installs and a program using `Effect.gen` + `Effect.retry` + `Schedule` + `Effect.forkScoped` + `Context.Service`/`Layer` + a span runs under `bun`
- [ ] `bun run typecheck` is green with the dependency present, and no `skipLibCheck` was added to make it pass
- [ ] `bun run check` shows no new failures, and cold-start / memory deltas are recorded
- [ ] The measured numbers are written into the *Spike Results* table of `epic-effect-v4-adoption-evaluation.md`
- [ ] A written PASS/FAIL verdict is recorded; on FAIL the epic is updated to close as "no adoption" and S2–S4 are marked blocked
- [ ] No `package.json` change lands from this ticket — the dependency stays in `.tmp/` until a "go" is recorded

## Files

- `.tmp/effect-compat-spike/` — scratch harness (git-ignored, delete before merge)
- `.plan/epics/epic-effect-v4-adoption-evaluation.md` — *Spike Results* row S1

## Dependencies

- Blocks: S2, S3, S4 (all are gated on this PASS)
- Blocked by: nothing
