<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Simplification audit artifacts lost to a .tmp/ cleanup: 13 tickets cite deleted scratch

**Status:** Not Started
**Priority:** high
**Effort:** Large
**Tags:** dead-code, plan-bookkeeping

**Summary:**

## What was lost

A `.tmp/` cleanup pass on 2026-10-12 deleted the whole `.tmp/simplification/` directory. Nine per-area over-engineering audit documents are gone from the dev checkout:

`platform.md`, `rpg.md`, `routes.md`, `frontend.md`, `generation.md`, `characters-assets.md`, `targets.md` (the ranked list), `verification.md`, `baseline.md`.

The deletion was a correct application of the AGENTS.md scratchpad rule. The loss is recorded here so the findings are not silently forgotten.

## Why it is unrecoverable (verified, not assumed)

- `git log --all --diff-filter=A --name-only -- ".tmp/*"` returns nothing — no `.tmp/` path was EVER tracked on any ref.
- `git ls-files -- ".tmp/*"` returns nothing at HEAD.
- `.gitignore:71` (`.tmp`) covered them the entire time.
- `git stash list` is empty.
- An `git fsck --no-reflogs --unreachable` scan of 6715 unreachable blobs, grepped for audit-unique markers, produced 6 candidates. All 6 were inspected and all are FALSE POSITIVES: four knip gaps JSON files, one superseded copy of the shrink-types plan ticket, one safetensors ticket.
- `.tmp/simplification/` is absent from the dev checkout.

Git never held these files. There is no commit, no dangling blob, no stash to recover from.

## Which documents cited them, and what each citation supported

**platform.md** — 4 tickets:

- `TASK-delete-dead-src-transport-protocol-handler-tree-and-write-on` — the claim that the entire HTTP/1.1 / H2 / WS / upgrade protocol-handler half of `src/transport/` is dead.
- `TASK-delete-duplicate-config-schema-shim-layers-dead-config-emitt` — five findings: delete `src/config/schema/`; yagni the parallel `src/config/schema-class/` shim layer; delete the four config generators; delete `src/config/migrate-config.ts`; three write-only-key findings.
- `TASK-delete-unreferenced-platform-service-util-modules-dead-barre` — test-only-but-production-unreachable service/util modules, two dead barrels, two unused runtime deps (blessed-contrib, htmx-ext-alpine-morph).
- `TASK-delete-unwired-dh-ratchet-e2e-subtree-in-src-crypto-e2e-and-` — delete the DH-ratchet / E2E-session subsystem under `src/crypto/e2e/`; delete `src/crypto/activitypub-keys.ts`.
- `TASK-simplification-cleanup-ranked-execution-order-and-dead-vs-un` — two bare pointers naming `platform.md` as the home of the corrected crypto keep-list.

**rpg.md** — 1 ticket:

- `TASK-delete-dead-rpg-regex-battle-plugins-subtrees-and-shim-barre` — the `src/rpg/integration-registry/` tree, the dead regex tier, test-only rpg services, shim barrels.

**routes.md** — 3 tickets:

- `TASK-delete-dead-src-transport-protocol-handler-tree-and-write-on` — the MUST RETAIN correction: proved `negotiation-parsers.ts` and `peer-table.ts` are live.
- `TASK-delete-unreferenced-route-validation-modules-dead-helpers-an` — findings 1-11.
- `TASK-shrink-unreferenced-types-and-helpers-in-routes-validation` — findings 17, 21, 23 (three zero-importer type declarations).

**frontend.md** — 2 tickets:

- `TASK-delete-orphaned-locale-keys-across-all-10-locale-files-leave` — the claim of 270 orphaned locale keys across all 10 locale files.
- `TASK-delete-unreachable-view-partials-orphan-partial-and-dead-css` — three Go-era `src/views/partials/` templates, the orphan `load-more.html` partial, dead gallery/app/vn/keynav/theme-no-icons CSS blocks.

**generation.md** — 1 ticket:

- `TASK-delete-unreferenced-generation-story-assistant-and-chat-code` — commented-out policy-detector examples, story back-compat shims, unwired assistant prompt sections, test-only exports.

**characters-assets.md** — 2 tickets:

- `TASK-delete-unreferenced-route-validation-modules-dead-helpers-an` — finding 2.
- `TASK-replace-hand-rolled-image-header-probing-in-src-assets-with-` — the finding that the image-header probing layer is hand-rolled and should delegate to the already-installed `sharp`.

**targets.md** — 1 ticket:

- `TASK-simplification-cleanup-ranked-execution-order-and-dead-vs-un` — the ranked execution ledger.

**All five area docs at once (brace form)** — 1 ticket:
- `TASK-simplification-sweep-micro-cleanups-and-single-implementatio` — cited `.tmp/simplification/{frontend,platform,rpg,routes,characters-assets}.md` for every `shrink:`/`yagni:`/`stdlib:`/`native:` non-deletion finding. This is the 13th citing ticket; it is easy to miss because the brace form does not match a literal per-file grep.

**verification.md**, **baseline.md** — named only in the manifest paragraph of `TASK-simplification-cleanup-ranked-execution-order-and-dead-vs-un`. No per-finding claim depended on either.

## What this means for the citing tickets

The citations were provenance pointers, not the load-bearing evidence. Each affected ticket already carries its substance inline (explicit file:line scope lists, MUST RETAIN lists, and a re-derive command), so the tickets still stand — but the numbers in them (270 locale keys, 7 error classes, 19 pure re-exports, finding counts) are now UNSOURCED and, per the no-volatile-metrics rule in AGENTS.md, were never authoritative anyway.

`TASK-delete-dead-src-transport-protocol-handler-tree-and-write-on` is the highest-risk case: its MUST RETAIN correction cites `routes.md` for the claim that `negotiation-parsers.ts` and `peer-table.ts` are production-live. The ticket does quote the exact grep and its two expected rows, so the correction is independently checkable — but it must be re-run before anyone cuts.

## The correct outcome

**Re-derive the audit. Do NOT trust the surviving citations.**

Re-running `bun run dead:code:src` does NOT restore this audit. That command finds unused FILES; the audit additionally classified DEAD (unreachable and untested — delete) from UNWIRED (complete and tested but unreferenced — a product decision), which is exactly the distinction the audit existed to record and which no current command reproduces.

Any count, finding number, or ranking taken from these tickets is unverified until the audit is redone. Recording a claim as CONFIRMED on the strength of a citation into a deleted file would be worse than having no ticket at all.

## Acceptance Criteria

- [ ] The audit is re-derived from the current tree, or each affected ticket is individually re-verified and its claim restated with a live, re-runnable proof.
- [ ] Every number currently in the 13 affected tickets is either re-derived or removed. No number is left standing on a dead citation.
- [ ] The DEAD vs UNWIRED classification in `TASK-simplification-cleanup-ranked-execution-order-and-dead-vs-un` is re-established against the current tree.
- [ ] `TASK-delete-dead-src-transport-protocol-handler-tree-and-write-on` re-runs the MUST RETAIN grep and confirms both survivors before any deletion.

## Context

Loss was detected by a repo-wide audit of dangling `.tmp/` citations in `.plan/`. Follow-up work on the same branch (`cf5cee4ff`, `d3ab2866`) replaced the dead paths with a named provenance marker plus the existing re-derive instructions. That repaired the false affordance; it did not and cannot restore the findings.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
