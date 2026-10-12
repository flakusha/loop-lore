<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Delete unwired DH-ratchet E2E subtree in src/crypto/e2e/ and dead activitypub-keys.ts

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

**Summary:**

Remove the built-but-never-wired X3DH double-ratchet and E2E session subsystem, plus the uncalled ActivityPub actor-key module. Research: .tmp/simplification/platform.md. Re-derive with 'bun run dead:code:src'.

**Context:**

A second, unwired ratchet implementation sits next to the live one. The browser E2E flow uses
`key-pairs.ts` + `ratchet.ts`; the server uses `server-registry.ts` — a *different* symmetric-key
ratchet. The DH-ratchet cluster (X3DH-style double ratchet) and its session store were built but
never wired into any production path. Source: `.tmp/simplification/platform.md` — findings
"`delete:` the DH-ratchet / ephemeral-ratchet / E2E-session subsystem under `src/crypto/e2e/`"
and "`delete:` `src/crypto/activitypub-keys.ts`". Re-derive the list with `bun run dead:code:src`.

**Scope — files to delete:**

- `src/crypto/e2e/dh-ratchet.ts:1-249`
- `src/crypto/e2e/dh-ratchet-helpers.ts:1-67`
- `src/crypto/e2e/dh-ratchet-primitives.ts:1-203`
- `src/crypto/e2e/double-ratchet.ts:1-225`
- `src/crypto/e2e/double-ratchet-chain.ts:1-43`
- `src/crypto/e2e/double-ratchet-constants.ts:1-14`
- `src/crypto/e2e/e2e-session.ts:1-232`
- `src/crypto/e2e/e2e-session-row.ts:1-51`
- `src/crypto/e2e/group-encrypt-message.ts:1-178`
- `src/crypto/e2e/wrap-sender-key.ts:1-259`
- `src/crypto/e2e/wrap-sender-key-helpers.ts:1-94`
- `src/crypto/e2e/latest-group-wrap.ts:1-40`
- `src/crypto/activitypub-keys.ts:1-170`
- the `*.test.ts` files that exist only to test the above (the DH-ratchet regression suites included)

**MUST RETAIN in `src/crypto/e2e/`:** `key-pairs.ts` (3 production importers), `ratchet.ts` (4),
`server-registry.ts` (1: `src/routes/actor-e2e-pubkeys.ts:25`).

**Evidence:**

- `grep -rn "e2e/dh-ratchet\"|from \"./dh-ratchet\"" --include=*.ts src tests` → 0 hits (not even its own
  tests import `dh-ratchet.ts`; they import `dh-ratchet-primitives` directly).
- `grep -rn "double-ratchet|ephemeralRatchet|ensureActiveSession|groupEncryptMessage" --include=*.ts src
  | grep -v ^src/crypto/e2e/` → 0 hits.
- For the ActivityPub module: `grep -rn "activitypub-keys|ActivityPubActorKey|generateActivityPubKey|rotateActivityPubKey|getActiveActivityPubKey"
  src tests scripts` → only self-references plus a prose comment at
  `src/characters/services/federation-consent.ts:84` that names the file as *not* the path used.

**Caveats / constraints:**

- OWNER DECISION REQUIRED before deleting the ratchet cluster. Open ticket
  `TASK-e2ee-double-ratchet` ("Client-Side E2E — Phase F Signal-grade double ratchet", epic
  `epic-crypto`, High risk) asks for X3DH + skipped-key retention + async ratchet state — exactly
  what this subtree already implements but never wires. Either that ticket is the plan and this code
  should be *wired* rather than deleted, or the ticket is stale and this subtree is dead weight.
  Do not delete it unilaterally; record the decision on both tickets.
- Related open/closed tickets that lose their subject with the delete (the DH-ratchet regression
  suites, `BUG-dhratchetdecrypt-mutates-opts-state-aliasing-hazard`,
  `BUG-dh-ratchet-regression-tests-lack-out-of-order-delivery`, and
  `BUG-activitypub-actor-signing-keys-and-rotation-undefined-no-crypto-epic-link`): note the impact in
  the PR rather than silently orphaning them.
- No change to encryption/auth/session-signing *correctness*, key derivation or trust-boundary
  validation. This is a dead-code removal only — do not "improve" the retained crypto paths.
- Verify no DB migration or `e2e_sessions` schema consumer expects these modules before deleting
  (`grep -rn "e2e-session-row|ensureActiveSession|latest-group-wrap" src scripts`).

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
