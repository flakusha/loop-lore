<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

## Item-systems deferred follow-ups (from `epic-item-systems-unification` backend 10/15)

> Backend wire-* work landed 2026-08-12 (10/10 tickets complete + review pass). The following
> were explicitly deferred and remain open — see `epic-item-systems-unification.md`
> § Remaining Points for full details.

| # | Deferred point | Blocks on | Where tracked |
|---|----------------|-----------|---------------|
| IS1 | Crafting station def/instance CRUD + `GET stations` route | `StationsService` (`TASK-complete-crafting-system-services`) | `TASK-wire-crafting-routes.md` |
| IS2 | Crafting attempt execution (`POST /craft`: consume materials → output, success/skill/level checks) | `CraftingProcessService` | `TASK-wire-crafting-routes.md` |
| IS3 | Crafting orders placed/fulfilled via HTTP (+ payment) | `CraftingProcessService` + TradeService (payment primitive exists) | `TASK-wire-crafting-routes.md`, `TASK-implement-trade.md` |
| IS4 | Trade offer/accept/cancel lifecycle (persistent pending exchanges) | — | `TASK-implement-trade.md` |
| IS5 | NPC trading (sell to NPC, buy from NPC inventory) | `TASK-npc-inventory-frontend` | `TASK-implement-trade.md` |
| IS6 | Trade history queryable | — | `TASK-implement-trade.md` |
| IS7 | Combat-action equipment usage + durability degradation in combat | — | `TASK-battle-item-integration.md` |

## Hardening / deferred clusters

| # | Item                                                                                                                                                                         | Status                                                    |
| - | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 1 | AUX M6 telemetry (tokens/latency per call)                                                                                                                                   | ✅ Done (2026-08-18) — `aux.call` events + `GET /api/admin/telemetry/aux` + latencyMs fix |
| 2 | World timeline §5.3 forward-event steering + §5.4 cross-story convergence                                                                                                    | 🟡 Greenfield (cluster B)                                 |
| 3 | Avatar-gallery visibility inheritance                                                                                                                                        | ✅ done (G6)                   |
| 4 | External music linking UI                                                                                                                                                    | 🟡 Open                                                   |
| 5 | Party join/leave with VN narration                                                                                                                                           | 🟡 Open                                                   |
| 6 | Authoring/creation ownership indicators                                                                                                                                      | 🟡 Open                                                   |
| 7 | MFA (TOTP) + `/api/sessions`                                                                                                                                                 | ⏸ Deferred P6+ (local-only auth)                          |
| 8 | Plugin ecosystem / three-tier memory / artifact / ComfyUI / provider ecosystem / RAG / social hub / decentralization / impersonation / 3D views / model-comparison reactions | ⏸ Deferred P6+ (see `epics/`)                             |
| 9 | Pre-compiled hot binary modules (native perf: crypto, compression, image/ML inference; Bun FFI + JS fallback)                                                                | ⏸ Deferred P6+ — added 2026-08-15 (matrix § integration; epic `epic-precompiled-hot-binaries.md` + `TASK-precompiled-hot-binaries.md`) |

> **2026-08-15 pull-forward:** matrix agentic addendum rates **G38 (proactive messaging),
> G39 (quiet hours), G40 (keyphrase recall) as 0.1.0 Quick Wins** — pulled from P6-E to
> `../priority-release-010.md` § 0.1.0 Quick Wins items 13–14 (`TASK-proactive-messaging`,
> `TASK-quiet-hours`, `TASK-keyphrase-recall`). Not deferred here.

