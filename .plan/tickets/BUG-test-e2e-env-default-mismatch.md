<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# e2e suite fails 29 tests with E2E_SAFEGUARD unset (canonical shape)

**Status:** open
**Priority:** high
**Effort:** Small
**Type:** Bug

**Summary:** Running the e2e suite with the canonical shape (`bun test --parallel=4 --isolate tests/e2e/`) and `E2E_SAFEGUARD` **unset** flips the v1 `governanceGuard` ON (its `enabled` predicate is `process.env.E2E_SAFEGUARD !== "1"`, which is `true` when the var is absent). The e2e harness fires hundreds of requests per user in milliseconds, so per-user windows 429 every flow. With the safeguard set to `1` the suite goes green (277 / 0); without it, 248 pass and 29 fail — every failure is `Received: 429` with body `{"error":"Rate limit exceeded","code":"TOO_MANY_REQUESTS",…}`. Four npm scripts (`test:e2e`, `test:e2e:browser`, `test:e2e:smoke`, `test:all`) do not export `E2E_SAFEGUARD=1`, so any developer running them locally sees the false-positive cascade.

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
**Context:** Filed via giwt template lacking required bold sections; normalized 2026-09-26 during the mock-isolation migration finalize.
**Acceptance Criteria:**
- [ ] Implementation complete
- [ ] Tests passing
- [ ] Verification executed green
