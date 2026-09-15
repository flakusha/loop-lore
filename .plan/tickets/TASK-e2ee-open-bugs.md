<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-e2ee-open-bugs: Fix open bugs against shipped E2E crypto code

**Status:** ✅ Done (closed 2026-09-15; all three sub-bugs already resolved on dev)
**Priority:** High
**Effort:** Small
**Type:** BUG
**Tags:** crypto, e2e, bug
**Epic:** epic-crypto
**Parent:** TASK-asymmetric-key-pairs-followup (umbrella)

## Summary

Resolve the three open bugs against the shipped `src/crypto/e2e/` + `src/utils/base64.ts` code **before Phase E starts**; one pre-existing config-infra bug is deferred to backlog.

## Context

Phases Foundation–D of the client-side E2E effort shipped (commit `10b203b4` on dev, merged as `17410ce1`). Audit found latent bugs in the ratchet and base64 helpers that Phase E receiver wiring will build directly on.

## Tasks

- [x] `BUG-dhratchetdecrypt-mutates-opts-state-aliasing-hazard.md` — `dhRatchetDecrypt` clones state before mutating (fixed by `f69d0229`). See `src/crypto/e2e/dh-ratchet.ts:164`.
- [x] `BUG-initdhratchetopts-theirinitialpub-declared-but-never-read.md` — dead `theirInitialPub` param removed (option A, fixed by `f69d0229`). See `src/crypto/e2e/dh-ratchet.ts:42-45`.
- [x] `BUG-base64-tobase64-coerces-undefined-to-0-via-bytes-i-0.md` — `toBase64` uses `bytes[i]!` (fixed by `f69d0229`). See `src/utils/base64.ts:22`.
- Deferred (not this ticket): `BUG-hot-reload-test-ts-asserts-trivially-true-on-emfile-enoent-c.md` — pre-existing config-infra coverage gap, unrelated to crypto. Backlog.

## Dependencies

- Parent hub: `TASK-asymmetric-key-pairs-followup.md`
- **Execute first** — TASK-e2ee-receiver-wiring builds on the fixed `dh-ratchet.ts` semantics.
- Siblings: TASK-e2ee-receiver-wiring (next), TASK-e2ee-double-ratchet, TASK-e2ee-crypto-ui.

## Resolution

Closed 2026-09-15. All three sub-bugs already resolved on dev by commit `f69d0229`; verified against current dev:

- `src/crypto/e2e/dh-ratchet.ts:164-170` — `dhRatchetDecrypt` clones state before mutating (aliasing hazard fixed; follow-on DH-step stale-chain regression also fixed, re-seed at `:205`).
- `src/crypto/e2e/dh-ratchet.ts:43-45` — `InitDhRatchetOpts` carries only `rootKey`; dead `theirInitialPub` removed.
- `src/utils/base64.ts:22` — `toBase64` uses `bytes[i]!`, no `?? 0` masking.
- `src/crypto/e2e/dh-ratchet.bugs.test.ts` — regression tests cover all three bugs plus out-of-order delivery.
- Gates: `bun test src/crypto/e2e/ src/utils/base64.test.ts` → 90 pass, 0 fail; `bun test src/frontend/e2e/` → 3 pass, 0 fail.
- Sub-bug tickets already closed: `BUG-dhratchetdecrypt-mutates-opts-state-aliasing-hazard`, `BUG-initdhratchetopts-theirinitialpub-declared-but-never-read`, `BUG-base64-tobase64-coerces-undefined-to-0-via-bytes-i-0` (+ `BUG-dhratchetdecrypt-dh-step-branch-derives-message-key-from-sta`).

No code change required.

## Acceptance Criteria

- [x] All three linked bugs closed with regression tests
- [x] `bun test src/crypto/e2e/ src/frontend/e2e/` green after fixes
