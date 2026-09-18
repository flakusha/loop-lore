<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Open — Index (In-Flight, Debt, Unwired Code & Deferred)

> **Last updated:** 2026-09-10 (post-August refresh — NSFW async pipeline + consent/route-authz wiring, mesh encrypted-sharing landed, coverage lifts with raised waiver floors, test-isolation hardening, templates admin gate; untriaged waves re-triaged in `open-untriaged.md`). Split into
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

P0 ✅ · P1 ✅ · P1.5 ✅ · P2 🟡 in progress (Gate C core shipped; NSFW async pipeline + consent/route-authz wiring landed; mesh encrypted-sharing landed; coverage lifts with raised waiver floors; test-isolation hardening green) · Regex ✅ · P3–P5 → 0.1.0 value
tiers (see `../priority.md`) · Gate C ✅ (complete — GM-guided story P2-Da done). **Sep-11: (+) 27 chat-variant + chat-feature tickets filed 2026-09-11 in `epic-chat-variants-taxonomy` + `epic-chat-product-features` — triage pending (see `open-untriaged.md`).**

## File map (split 2026-08-15)

| File | Holds |
| ---- | ----- |
| [`open-inflight.md`](./open-inflight.md) | **In-flight / decision queue** — rows needing a finalize-vs-defer call (A5–W3, B/C/D/E/F/G series) + open/next actions |
| [`open-debt.md`](./open-debt.md) | **Debt** — dead/unwired code, schema drift / latent bugs, release hardening |
| [`open-deferred.md`](./open-deferred.md) | **Deferred** — item-systems deferred follow-ups (IS1–IS7), hardening / deferred clusters, pull-forward notes |
| [`open-untriaged.md`](./open-untriaged.md) | **Untriaged** — re-triaged 2026-09-10: Aug-25 waves closed out, current advisory orphans + new cluster suggestions (mesh/federation, VN sprites, RPG opt-in, coverage waivers, item-gen) |
| [`open-closed.md`](./open-closed.md) | **Closed (reference)** — recent wiring log, security & access closed, resolved (moved off), preserved notes |
| [`bucket-A-security-perf-close-out-2026-09-03.md`](./bucket-A-security-perf-close-out-2026-09-03.md) | **Bucket A close-out (2026-09-03)** — 33 commits landed (20 security + 6 perf + 7 tooling); 8 audit follow-ups filed as TASK-audit-follow-up-* |
| [`bucket-x-build-integrity-close-out-2026-09-03.md`](./bucket-x-build-integrity-close-out-2026-09-03.md) | **Bucket X close-out (2026-09-03)** — 4 release-blocking tsc/tooling defects + 1 dprint follow-up; all Bucket X BUG tickets Resolved |
| [`open-vn-settings-bugs.md`](./open-vn-settings-bugs.md) | **VN settings bug cluster** — 7 interlocking bugs around visualNovel type mismatch, mode lock, redundant state, gmConfig save path, role restriction, missing VN fields |
| [`security-review-2026-08-25.md`](./security-review-2026-08-25.md) | **Security review plan** — auth/access surface findings (CRIT→LOW) + proposed fix tickets + next-review backlog (WS/RBAC/asset reviews done 2026-08-25) |

`../priority.md` holds the priority ladder P0→P6+ — see its index.

## Open / next actions (2026-09-10 refresh)

- **Mesh encrypted-sharing landed** — `src/federation/` shipped (`sharing.ts`, `envelope.ts`, `encryption.ts`, `cipher.ts`, `clock.ts`, `delivery.ts`, `duplication.ts`, `fan-out.ts`, `gossip.ts`, `negotiation.ts`, `peer-fetch.ts`, `peer-keys.ts`, `coordinator.ts` + tests), finalized to `dev` (`3e53c4ff2`). Next: close the mesh/federation interconnect batch (`open-untriaged.md`) -- scheduled after the landed content-sharing work.
- **NSFW hardening landed** — async request-context pipeline with batched gates and server-side skips, consent-gate + route-authz + preconditions wiring, bans/participant-deny/consent enforced in all gates, HKDF domain separation for actor/chat hashes. NSFW consent-surface follow-ups (`d7c0253`, `e0d7c5c`, `e8f7a75`) closed 2026-09-09 — see `open-untriaged.md`.
- **Coverage + test health** — plugin/persona/native suites lifted with waiver floors raised to match; cross-file pollution eliminated with pristine-module gates; templates admin gate enforced. Remaining: below-floor modules tracked by waiver tickets + new frontend coverage batches. Details: `open-inflight.md`.
- **Release blockers: A8 ✅ closed; A9 open** (tag 0.1.0 + push) — `open-inflight.md`.
- **Dead/unwired code**: transport module, music/SFX/Video stubs — `open-debt.md`.

## Preserved note — concurrent author's claim (2026-08-06 → **landed on dev 2026-08-07**)

> The author's uncommitted `backlog.md` recorded the auth/access fixes as shipped **on branch
> `auth-access-fixes` (commits `8f2a6d71` + `73cda7b9`)**, marking rows 192–222 ✅. The original
> commits were not directly merged, but the fixes **landed on `dev`** under new hashes —
> `7dc68be7` (critical bypasses) + `c78e5466` (remaining gaps) + `c99704c1` (401-guard
> unification). **RESOLVED — do not treat as open.** Full detail: `open-closed.md`.
