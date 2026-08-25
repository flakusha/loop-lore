<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Open — Index (In-Flight, Debt, Unwired Code & Deferred)

> **Last updated:** 2026-08-16 (.plan housekeeping — sync-ticket tooling extended with
> git_issue link/stale/orphan checks; 5 stale git issues closed; 597 missing git_issue
> fields bulk-linked; feature matrix items promoted to P4/P5/P6 tiers). Split into
> per-category files 2026-08-15 (was a single monolith); this index holds the status
> header + file map. Holds what is **currently in flight / needing a decision / open debt / deferred (P6+)**. The priority ladder P0→P6+ lives in `../priority.md` (index → tier files).
>
> **Context recovery note (2026-08-15):** this refresh reflects (a) Gate C sub-items
> verified shipped on `dev` 2026-08-12, (b) **worktrees merged** — item-systems
> backend wiring (`rpg-wire-routes`), docs reconciliation (`docs-reconcile`),
> memory-selection UI (dev `5e62eea7`/`3d8ba302`), C1 group-chat participant panel
> (`7cd4a06b`), and recovered-features all landed on `dev`, (c) SSE refactor committed
> (`082c20cf`), (d) `dev` ahead of `origin/dev` (unreleased — push
> still pending, row W3 below), (e) **A5 lint-ts + A7 e2e CLOSED 2026-08-14** in
> worktrees `lint-ts-debt` + `e2e-stabilization` (check gate green; browser e2e
> green ×2). **GM-guided story (P2-Da) DONE 2026-08-14** — merged to `dev`
> (`480434d6` UI, `3f85b74b` model config, `4b0dd146` orchestrator consumption).
> (f) **7 more RPG services wired (`51a7bc01`, 2026-08-14)** — achievements, skills,
> npc-navigation, replayability, world-location-traits, xp-loot, combat + quest
> engine consolidation (see `open-debt.md` § Dead/unwired #12).

## Status header

P0 ✅ · P1 ✅ · P1.5 ✅ · P2 🟡 in progress (Gate C core shipped 2026-08-12; item-systems
wiring + docs reconciliation + memory-selection UI + C1 participant panel + GM-guided
story merged 2026-08-14; **lint-ts + e2e gates closed 2026-08-14**) · Regex ✅ · P3–P5 → 0.1.0 value
tiers (see `../priority.md`) · Gate C ✅ (complete — GM-guided story P2-Da done).

## File map (split 2026-08-15)

| File | Holds |
| ---- | ----- |
| [`open-inflight.md`](./open-inflight.md) | **In-flight / decision queue** — rows needing a finalize-vs-defer call (A5–W3, B/C/D/E/F/G series) + open/next actions |
| [`open-debt.md`](./open-debt.md) | **Debt** — dead/unwired code, schema drift / latent bugs, release hardening |
| [`open-deferred.md`](./open-deferred.md) | **Deferred** — item-systems deferred follow-ups (IS1–IS7), hardening / deferred clusters, pull-forward notes |
| [`open-untriaged.md`](./open-untriaged.md) | **Untriaged** — git issues with no index entry (2026-08-25 security/hardening wave), cluster suggestions, known index defects |
| [`open-closed.md`](./open-closed.md) | **Closed (reference)** — recent wiring log, security & access closed, resolved (moved off), preserved notes |
| [`security-review-2026-08-25.md`](./security-review-2026-08-25.md) | **Security review plan** — auth/access surface findings (CRIT→LOW) + proposed fix tickets + next-review backlog (WS/RBAC/asset reviews done 2026-08-25) |

`../priority.md` holds the priority ladder P0→P6+ — see its index.

## Open / next actions (2026-08-15, after 51a7bc01 wiring + GM-guided merge)

- **W3: Push `dev` → `origin/dev`** — dev ahead (unreleased: Gate C, GM-guided story,
  item-systems + 7 wired RPG services, docs reconciliation, memory-selection UI, C1
  panel). Before release (row A9). Pre-push hook blocks agent commits — human push
  required. Details: `open-inflight.md`.
- **Remaining release blockers: A8 ✅ CLOSED 2026-08-18** (`49ee5c1a`) — IS1-IS7 + LoRA all wired on `dev` (see `open-debt.md` #12 + #5) **+ A9** (tag 0.1.0 + push) — `open-inflight.md`.
- **Dead/unwired code**: transport module, music/SFX/Video stubs — `open-debt.md`.

## Preserved note — concurrent author's claim (2026-08-06 → **landed on dev 2026-08-07**)

> The author's uncommitted `backlog.md` recorded the auth/access fixes as shipped **on branch
> `auth-access-fixes` (commits `8f2a6d71` + `73cda7b9`)**, marking rows 192–222 ✅. The original
> commits were not directly merged, but the fixes **landed on `dev`** under new hashes —
> `7dc68be7` (critical bypasses) + `c78e5466` (remaining gaps) + `c99704c1` (401-guard
> unification). **RESOLVED — do not treat as open.** Full detail: `open-closed.md`.
