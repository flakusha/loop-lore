<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

## Item-systems deferred follow-ups — ✅ CLOSED 2026-08-18

The IS1–IS7 deferrals (crafting stations/execution/orders, trade lifecycle, NPC trading,
trade history, combat equipment durability) all shipped in the A8 unwired close-out
(`49ee5c1a`, routes mounted in `src/app/register-plugins.ts`). History:
`open-closed.md` § Dead / unwired + `../open-debt.md`.

## Hardening / deferred clusters

| # | Item                                                                                                                                                                         | Status                                                    |
| - | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 2 | World timeline §5.3 forward-event steering + §5.4 cross-story convergence | 🟡 Service layer done 2026-09-10 (`event-steering.ts`); branching UI + `loreSection` injection open — `TASK-timeline-branching-ui.md` |
| 4 | External music linking UI                                                                                                                                                    | 🟡 Open                                                   |
| 5 | Party join/leave with VN narration | 🟡 Phase 1 shipped 2026-08-19; Phases 3–4 (split/reunite + VN choice cards) open — `TASK-travel-party-migration.md` |
| 6 | Authoring/creation ownership indicators                                                                                                                                      | 🟡 Open                                                   |
| 7 | MFA (TOTP) + `/api/sessions`                                                                                                                                                 | 🔄 Re-planned 2026-09-02 (`epic-auth-channel-provisioning.md` + `matrix-authentication-channels.md`); impl still P6+ until human triage                          |
| 8 | Plugin ecosystem / three-tier memory / artifact / ComfyUI / provider ecosystem / RAG / social hub / decentralization / impersonation / 3D views / model-comparison reactions | ⏸ Deferred P6+ (see `epics/`)                             |
| 9 | Pre-compiled hot binary modules (native perf: crypto, compression, image/ML inference; Bun FFI + JS fallback)                                                                | ⏸ Deferred P6+ — added 2026-08-15 (`matrix-precompiled-hot-binaries.md`; epic `epic-precompiled-hot-binaries.md` + `TASK-precompiled-hot-binaries.md`) |

> **2026-08-15 pull-forward:** matrix agentic addendum rates **G38 (proactive messaging),
> G39 (quiet hours), G40 (keyphrase recall) as 0.1.0 Quick Wins** — pulled from P6-E to
> `../priority-release-010.md` § 0.1.0 Quick Wins items 13–14 (`TASK-proactive-messaging`,
> `TASK-quiet-hours`, `TASK-keyphrase-recall`). Not deferred here.
>
> **Closed clusters dropped 2026-09-26** — the 2026-09-03 config-schema / DevEx bug cluster
> (`2d7a60c`, `8f17329`, `94675a8`, `508a7ea`; all landed or resolved on their tickets) and
> the 8-ticket audit follow-up cluster (resolved 2026-09-10). Open size-gate work lives in
> `TASK-size-strict-debt`, `TASK-frontend-size-gate`, `TASK-promote-size-check-to-ci` and
> `../priority-release-010.md`.

