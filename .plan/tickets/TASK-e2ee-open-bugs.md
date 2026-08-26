<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-e2ee-open-bugs: Fix open bugs against shipped E2E crypto code

**Status:** ⬜ Not Started
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

- [ ] `BUG-dhratchetdecrypt-mutates-opts-state-aliasing-hazard.md` — `dhRatchetDecrypt` continuation branch aliases caller's state. Latent bug if a caller retains the input. Fix: clone `state` at the top of the function. See `src/crypto/e2e/dh-ratchet.ts:156`.
- [ ] `BUG-initdhratchetopts-theirinitialpub-declared-but-never-read.md` — `initDhRatchet` accepts `theirInitialPub` but never uses it. Misleading API; remove the dead param + callsites (option A from the ticket) — option B (use it to seed the DH) would break the existing test contract that asserts `sendingChainKey === receivingChainKey` derived from root. See `src/crypto/e2e/dh-ratchet.ts:42-79`.
- [ ] `BUG-base64-tobase64-coerces-undefined-to-0-via-bytes-i-0.md` — `toBase64` reads `bytes[i] ?? 0`; the `?? 0` is dead for `Uint8Array` and silently masks caller bugs. Replace with `bytes[i]!`. Affects `dh-ratchet.ts`. See `src/utils/base64.ts:18`.
- Deferred (not this ticket): `BUG-hot-reload-test-ts-asserts-trivially-true-on-emfile-enoent-c.md` — pre-existing config-infra coverage gap, unrelated to crypto. Backlog.

## Dependencies

- Parent hub: `TASK-asymmetric-key-pairs-followup.md`
- **Execute first** — TASK-e2ee-receiver-wiring builds on the fixed `dh-ratchet.ts` semantics.
- Siblings: TASK-e2ee-receiver-wiring (next), TASK-e2ee-double-ratchet, TASK-e2ee-crypto-ui.

## Acceptance Criteria

- [ ] All three linked bugs closed with regression tests
- [ ] `bun test src/crypto/e2e/ src/frontend/e2e/` green after fixes
