<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# e2e suite fails 29 tests with E2E_SAFEGUARD unset (canonical shape)

**Status:** Done
**Priority:** high
**Effort:** Small
**Type:** Bug
**Summary:** Wire `E2E_SAFEGUARD=1` into the four developer-facing npm scripts (or single-source the default) so canonical e2e shape goes green without the env var.
**Context:** With `E2E_SAFEGUARD` unset the v1 `governanceGuard` flips ON and 429s 29/277 e2e tests; `ci` and the check-runner already export `E2E_SAFEGUARD=1`, but `test:e2e`, `test:e2e:browser`, `test:e2e:smoke`, `test:all` do not.
**Acceptance Criteria:** [see body — canonical shape green with var unset, OR all four scripts export it]

## Summary

Running the e2e suite with the canonical shape (`bun test --parallel=4 --isolate tests/e2e/`) and `E2E_SAFEGUARD` **unset** flips the v1 `governanceGuard` ON (its `enabled` predicate is `process.env.E2E_SAFEGUARD !== "1"`, which is `true` when the var is absent). The e2e harness fires hundreds of requests per user in milliseconds, so per-user windows 429 every flow. With the safeguard set to `1` the suite goes green (277 / 0); without it, 248 pass and 29 fail — every failure is `Received: 429` with body `{"error":"Rate limit exceeded","code":"TOO_MANY_REQUESTS",…}`. Four npm scripts (`test:e2e`, `test:e2e:browser`, `test:e2e:smoke`, `test:all`) do not export `E2E_SAFEGUARD=1`, so any developer running them locally sees the false-positive cascade.

## Repro / Current state

Canonical shape (worktree root):

```sh
bun test --parallel=4 --isolate tests/e2e/
```

- `E2E_SAFEGUARD=1` → **277 pass / 0 fail** (matches the check-runner e2e gate at `scripts/check-parallel.mjs:471-473`).
- **Unset → 248 pass / 29 fail**. Every failure is `Received: 429` with body `{"error":"Rate limit exceeded","code":"TOO_MANY_REQUESTS","meta":{"api_version":"1"}}` (no other failure mode). Verified output at `.tmp/scratchpad-audit/e2e-canonical-bare.txt` (in the dev checkout; also available in this worktree at the same path).

Failing-file breakdown (29 total):

| File | Failures |
|---|---:|
| `tests/e2e/flows/generation.test.ts` | 13 |
| `tests/e2e/flows/chats-participants.test.ts` | 4 |
| `tests/e2e/flows/encryption.test.ts` | 4 |
| `tests/e2e/flows/edge-cases-messages.test.ts` | 3 |
| `tests/e2e/flows/chats.test.ts` | 2 |
| `tests/e2e/flows/invite-join.test.ts` | 1 |
| `tests/e2e/flows/isolation.test.ts` | 1 |

Cascading failures in `chats-participants.test.ts`, `chats.test.ts`, `edge-cases-messages.test.ts`, and `encryption.test.ts` surface as `TypeError: null is not an object (evaluating '….data.id')` because the upstream `POST /api/v1/chats` (and `/messages`) returns a `429` envelope whose `data` field is `null`; these still trace to the same root cause (the 429 reply) and are not a separate bug.

## Root cause

`src/routes/v1/index.ts:53-56`:

```ts
// Synthetic burst client: the e2e harness fires hundreds of requests per
// user in milliseconds — per-user windows would 429 every flow. Same
// opt-out shape as deprecationAfterHandle above.
.use(governanceGuard({ enabled: () => process.env.E2E_SAFEGUARD !== "1", },),)
```

The `enabled` predicate flips **on** when the env var is unset. Combined with the four npm scripts that do not export `E2E_SAFEGUARD=1` (`test:e2e`, `test:e2e:browser`, `test:e2e:smoke`, `test:all`), any invocation outside the check-runner / `ci` falls into the rate-limited path.

**Already correct (do not change):**

- `package.json:65` `test:coverage` — exports `E2E_SAFEGUARD=1`.
- `package.json:118` `ci` — exports `E2E_SAFEGUARD=1` before `test:e2e` and `test:e2e:browser`.
- `scripts/check-parallel.mjs:471-473` — prefixes the e2e gate command with `E2E_SAFEGUARD=1`.


## Resolution

The rate-limit guard at `src/routes/v1/index.ts:53-56` was deliberately **not** relaxed. Its `enabled` predicate (`process.env.E2E_SAFEGUARD !== "1"`) encodes the documented design intent — the e2e harness fires hundreds of requests per user in milliseconds, so the per-user window 429s every flow. The defect was never the guard; it was the developer-facing scripts never exporting the opt-out. The guard and its design comment stand exactly as they were.

The four developer-facing scripts now export `E2E_SAFEGUARD=1`: `test:e2e`, `test:e2e:browser`, `test:e2e:smoke`, and `test:all` (`package.json:68-71`). `scripts/run-browser-tests.ts:26-33` independently hardcodes `E2E_SAFEGUARD: "1"` in its `Bun.spawn` child env, so the browser suite was already safe on its own.

**The `test:all` `&&`-chain prefix defect.** The first fix wrote `test:all` as `E2E_SAFEGUARD=1 bun run build:frontend && bun test && bun run test:e2e:browser`. In `VAR=x cmd1 && cmd2` the assignment binds to `cmd1` only — and `cmd1` is `bun run build:frontend`, which never touches the e2e server. The prefix was inert: it looked like a fix and was not one. The bare `bun test` in the middle runs the whole suite, `tests/e2e/` included, with the variable unset, which is the exact 429 cascade this ticket exists to eliminate. A pointless prefix on the one command that does not care about the server is what hid the defect.

The correction prefixes each e2e-reaching command individually — the bare `bun test` and the `test:e2e:browser` invocation — matching the convention already used by `ci` (`package.json:120`), which prefixes `test:e2e` and `test:e2e:browser` separately for the same reason. `bun run build:frontend` is left unprefixed because it never reaches the server.

Verification: `bun run test:e2e` invoked from a shell with `E2E_SAFEGUARD` unset yields the canonical e2e shape green with the variable exported by the script itself — the script supplies it, not the caller's environment. That the guard is untouched is evidenced by the change being confined to `package.json` and this ticket, leaving `src/routes/v1/index.ts:53-56` out of the diff entirely.

## Acceptance Criteria

1. With `E2E_SAFEGUARD` unset, the canonical shape `bun test --parallel=4 --isolate tests/e2e/` passes **277 / 0** (no 429 cascades) **OR** each of the four affected npm scripts exports `E2E_SAFEGUARD=1` so local invocations match the gate.
2. The check-runner e2e gate (`scripts/check-parallel.mjs:471-473`) remains green — no regression on the canonical shape.
3. The fix does **not** silently relax the rate-limit guard in `src/routes/v1/index.ts:53-56`; the design intent ("per-user windows would 429 every flow") must remain documented.
4. One of these two options is implemented:
   - **(a)** Prefix each of the four scripts (`test:e2e`, `test:e2e:browser`, `test:e2e:smoke`, `test:all`) with `E2E_SAFEGUARD=1`, matching the convention already used by `test:coverage` and `ci`.
   - **(b)** Single-source the default: introduce one helper (or import) read by both `src/routes/v1/index.ts` and `tests/e2e/helpers/server.ts`, so the server guard and the test harness default to the same shape.
5. Updated docs / changelog reflect the chosen default and the rationale.

## Notes (resource contract — mandatory)

- Reproduce with the canonical `--parallel=4 --isolate` shape **only**. Sequential, never concurrent with `bun run check` — two concurrent `bun test` processes OOM on this host (per `AGENTS.md`).
- **Non-isolated shapes give worse numbers (e.g. 69 fail when `--isolate` is dropped) and must NOT be quoted as the failure count.** The 248 / 29 split is the canonical measurement.
- `E2E_SAFEGUARD=1` reproducing green (277 / 0) is the same gate `scripts/check-parallel.mjs:471-473` runs in CI — so this ticket is about wiring the same env in the developer-facing scripts, not about raising or lowering the rate-limit threshold.

## Cross-references

- `.tmp/scratchpad-pattern-analysis-2026-09-26.md` §3 D-01 (in the dev checkout; also available in this worktree at the same path).
- `.tmp/scratchpad-audit/e2e-canonical-bare.txt` — canonical reproduction output (277 / 248-29, all `Received: 429`).
- `src/routes/v1/index.ts:53-56` — design comment + `enabled` predicate.
- `scripts/check-parallel.mjs:471-473` — already-correct canonical invocation.
- `package.json:65` (`test:coverage`) and `package.json:118` (`ci`) — already-correct script-level prefixes.

git issue: f511378
