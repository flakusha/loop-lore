<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Delete unwired DH-ratchet E2E subtree in src/crypto/e2e/ and dead activitypub-keys.ts

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-crypto

**Summary:**

Remove the built-but-never-wired X3DH double-ratchet and E2E session subsystem, plus the uncalled ActivityPub actor-key module. Research: the platform slice of the over-engineering audit (scratch, not on disk). Re-derive with 'bun run dead:code:src'.

**Context:**

A second, unwired ratchet implementation sits next to the live one. The browser E2E flow uses
`key-pairs.ts` + `ratchet.ts`; the server uses `server-registry.ts` — a *different* symmetric-key
ratchet. The DH-ratchet cluster (X3DH-style double ratchet) and its session store were built but
never wired into any production path. Source: the platform slice of the over-engineering audit (scratch, not on disk) — findings
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

**MUST RETAIN — the keep-list is TWO CASES, not one:**

- **server-live** — `src/crypto/e2e/server-registry.ts` (1 production importer:
  `src/routes/actor-e2e-pubkeys.ts:25`). Live today; do not touch.
- **frontend-e2e-only** — `src/crypto/e2e/key-pairs.ts`, `src/crypto/e2e/ratchet.ts`, and the
  `src/frontend/e2e/` tree itself. Their only importers are `src/frontend/e2e/{encrypt-message,
  decrypt-message,key-store}.ts`, and that subtree is neither wired nor bundled (see the
  Evidence section). **`key-pairs.ts` and `ratchet.ts` MUST be retained until
  `src/frontend/e2e/e2e-roundtrip.test.ts` has a verified replacement** — they are the only
  consumers those tests exercise, so deleting them would silently gut a passing suite.
- `src/frontend/e2e/**` is therefore IN SCOPE for the *decision* this ticket makes, but it is not
  a delete list: resolve it explicitly (wire it into a bundle, or retire it with its own ticket)
  rather than leaving it as an unexamined island. Do not delete it as a side effect of the
  `src/crypto/e2e/` cleanup.

**Evidence:**

- `grep -rn "e2e/dh-ratchet\"|from \"./dh-ratchet\"" --include=*.ts src tests` → 0 hits (not even its own
  tests import `dh-ratchet.ts`; they import `dh-ratchet-primitives` directly).
- `grep -rn "double-ratchet|ephemeralRatchet|ensureActiveSession|groupEncryptMessage" --include=*.ts src
  | grep -v ^src/crypto/e2e/` → 0 hits.
- For the ActivityPub module: `grep -rn "activitypub-keys|ActivityPubActorKey|generateActivityPubKey|rotateActivityPubKey|getActiveActivityPubKey"
  src tests scripts` → only self-references plus a prose comment at
  `src/characters/services/federation-consent.ts:84` that names the file as *not* the path used.
- CORRECTION (adversarial verification, 2026-10-12) — the keep-list this ticket previously gave was
  wrong for two of its three entries. `key-pairs.ts` and `ratchet.ts` have **no production
  importer**; the counts quoted for them were raw import statements inside `src/frontend/e2e/`,
  a subtree that is itself unwired and not bundled:
  - `grep -rn "frontend/e2e" .` outside `src/frontend/e2e/` returns only
    `scripts/check/test-gaps-baseline.json:665-666` (a coverage-baseline symbol list, not an
    import edge) and `src/crypto/e2e/e2e-session.integration.test.ts:35,39` (a test).
  - `scripts/build-frontend.mjs:22-59` bundles exactly alpine-init, pages, chat-vendor,
    chat-list, locale-init, wasm-loader and the two workers. No `knip` entry, no build script
    and no CI reference reaches `src/frontend/e2e/`.
  - `bun test src/frontend/e2e/e2e-roundtrip.test.ts` → 3 pass / 0 fail, so both modules are
    **test-live** and must not be deleted without a verified replacement.
- `server-registry.ts` is the only genuinely server-live member of the cluster:
  `src/routes/actor-e2e-pubkeys.ts:25`.

**Caveats / constraints:**

- OWNER DECISION REQUIRED before deleting the ratchet cluster. `TASK-e2ee-double-ratchet`
  ("Client-Side E2E — Phase F Signal-grade double ratchet", epic `epic-crypto`, High risk) is
  **OPEN** and asks for X3DH + skipped-key retention + async ratchet state — exactly what this
  subtree already implements but never wires. This cluster is therefore **contested future work,
  not settled dead code**. Either that ticket is the plan and this code should be *wired* rather
  than deleted, or the ticket is stale and this subtree is dead weight. Do not delete it
  unilaterally; record the decision on both tickets.
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
