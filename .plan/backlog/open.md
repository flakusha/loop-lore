<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Open — Index (In-Flight, Debt, Unwired Code & Deferred)

> **Last updated:** 2026-09-26 (prune pass — retired cluster docs removed, resolved
> rows dropped from the open queues). This index holds the status header + file map;
> it was split out of a single monolith 2026-08-15. It covers what is **currently in
> flight / needing a decision / open debt / deferred (P6+)**. The priority ladder P0→P6+
> lives in `../priority.md` (index → tier files).
>
> **Pruned 2026-09-26** — four documents were removed as no longer relevant. Their
> resolution evidence lives in `open-closed.md`, in the per-ticket `## Resolution`
> blocks, and in the git log:
>
> | Removed | Why |
> | ------- | --- |
> | `open-build-integrity.md` | Retired pointer stub (2026-09-18); the cluster closed via Bucket X. |
> | `open-vn-settings-bugs.md` | All 7 issues resolved 2026-09-05; kept as a checked row in `priority-p3-p5.md`. |
> | `bucket-A-security-perf-close-out-2026-09-03.md` | Completed-work snapshot; duplicated by `open-closed.md` § Bucket A close-out. |
> | `bucket-x-build-integrity-close-out-2026-09-03.md` | Completed-work snapshot; duplicated by `open-closed.md` § Retired 2026-09-18. |
>
> **Context recovery note (2026-08-15):** the August refresh reflected (a) Gate C sub-items
> verified shipped on `dev` 2026-08-12, (b) **worktrees merged** — item-systems
> backend wiring (`rpg-wire-routes`), docs reconciliation (`docs-reconcile`),
> memory-selection UI (dev `5e62eea7`/`3d8ba302`), C1 group-chat participant panel
> (`7cd4a06b`), and recovered-features all landed on `dev`, (c) SSE refactor committed
> (`082c20cf`), (d) `dev` ahead of `origin/dev` (unreleased — push
> still pending; folded into row A9, push is human-only), (e) **A5 lint-ts + A7 e2e CLOSED 2026-08-14** in
> worktrees `lint-ts-debt` + `e2e-stabilization` (check gate green; browser e2e
> green ×2). **GM-guided story (P2-Da) DONE 2026-08-14** — merged to `dev`
> (`480434d6` UI, `3f85b74b` model config, `4b0dd146` orchestrator consumption).
> (f) **7 more RPG services wired (`51a7bc01`, 2026-08-14)** — achievements, skills,
> npc-navigation, replayability, world-location-traits, xp-loot, combat + quest
> engine consolidation (see `open-closed.md`).

## Status header

P0 ✅ · P1 ✅ · P1.5 ✅ · P2 🟡 in progress (Gate C core shipped; NSFW async pipeline + consent/route-authz wiring landed; mesh encrypted-sharing landed; coverage lifts with raised waiver floors; test-isolation hardening green) · Regex ✅ · P3–P5 → 0.1.0 value
tiers (see `../priority.md`) · Gate C ✅ (complete — GM-guided story P2-Da done). **Sep-11: (+) 27 chat-variant + chat-feature tickets filed 2026-09-11 in `epic-chat-variants-taxonomy` + `epic-chat-product-features` — triage pending (see `open-untriaged.md`).**

## File map (split 2026-08-15)

| File | Holds |
| ---- | ----- |
| [`open-inflight.md`](./open-inflight.md) | **In-flight / decision queue** — rows needing a finalize-vs-defer call (A9, C5, C7, D3, G2, X2) + draft-epic planning rows (R1, R2) + deferred pointers |
| [`open-debt.md`](./open-debt.md) | **Debt** — dead/unwired code, migration hygiene, release hardening, closed-cluster record |
| [`open-deferred.md`](./open-deferred.md) | **Deferred** — hardening / deferred clusters (stable row ids), pull-forward notes, dropped-cluster record |
| [`open-untriaged.md`](./open-untriaged.md) | **Untriaged** — re-triaged 2026-09-10: Aug-25 waves closed out, current advisory orphans + new cluster suggestions (mesh/federation, VN sprites, RPG opt-in, coverage waivers, item-gen) |
| [`open-closed.md`](./open-closed.md) | **Closed (reference)** — recent wiring log, security & access closed, resolved (moved off), preserved notes |
| [`security-review-2026-08-25.md`](./security-review-2026-08-25.md) | **Security review plan** — auth/access surface findings (CRIT→LOW) + proposed fix tickets + next-review backlog (WS/RBAC/asset reviews done 2026-08-25) |

`../priority.md` holds the priority ladder P0→P6+ — see its index.

## Open / next actions (2026-09-26 prune)

- **Release blocker: A9** — tag `0.1.0` + push `dev`→`origin/dev` (both are human-only: agents never tag or push) — `open-inflight.md`.
- **Core-finalization remainder** — C7 Phases 3–4 (party split/reunite + VN choice cards), G2 branching UI, `/api/sessions`, e2e auth/NSFW/users gaps — `open-inflight.md` § 2026-09-11 wave.
- **Dead/unwired code** — transport module, music/SFX/Video stubs — `open-debt.md`.
- **Coverage** — below-floor modules tracked by waiver tickets + frontend coverage batches — `open-untriaged.md`.
- **Triage** — chat-variants + chat-product-features clusters (27 tickets filed 2026-09-11) awaiting epic linkage — `open-untriaged.md`.
- **Landed history** (mesh sharing, NSFW pipeline, coverage lifts, test isolation, audit clusters) lives in `open-closed.md`.

## Preserved note — concurrent author's claim (2026-08-06 → **landed on dev 2026-08-07**)

> The author's uncommitted `backlog.md` recorded the auth/access fixes as shipped **on branch
> `auth-access-fixes` (commits `8f2a6d71` + `73cda7b9`)**, marking rows 192–222 ✅. The original
> commits were not directly merged, but the fixes **landed on `dev`** under new hashes —
> `7dc68be7` (critical bypasses) + `c78e5466` (remaining gaps) + `c99704c1` (401-guard
> unification). **RESOLVED — do not treat as open.** Full detail: `open-closed.md`.
