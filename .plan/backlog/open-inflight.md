<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

## In-flight / decision queue — rows needing a finalize-vs-defer call

> Rule: when a row is decided, finalize means checking it off in the matching
> `../priority-*.md` tier and removing it here; defer means moving it to
> `open-deferred.md`. Rows already shipped, and rows that only mirror a
> `../priority-*.md` tier, are removed. This file is pruned on every backlog pass —
> if a row is neither open here nor in a tier file nor deferred, it is lost.
>
> **Pruned 2026-09-26.** Removed shipped rows: A5, A7, A8, B8, B10, C1, C2, C3, C4, C6,
> D1, D2, E1, E2, F3, G6, V1, X1, H1, H2, H3. W3 folded into A9 (same human-only push).
> Dated next-actions sections retired to `open-closed.md`.

| ID  | Item                                                                                    | Ticket / where                               | Recommend                       | Decision              |
| --- | --------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------- | --------------------- |
| A9  | Release artifacts (release-process, changelog) + push `dev`→`origin/dev`                | `../priority-release-010.md`              | ▲ now                           | 🟡 `docs/meta/release-process.md` + `CHANGELOG.md` done 2026-08-15; **tag v0.1.0 deliberately NOT created — post-testing human decision, never agent-side**; **push pending: pre-push hook blocks agent, human must push** |
| C5  | LLM providers (Anthropic/Ollama/Bedrock)                                               | `../priority-p3-p5.md`                          | ▲ now                           | 🟡 Anthropic + Ollama native providers shipped 2026-08-17 (`chat-matrix-ui-remainder`); Bedrock deferred (AWS SigV4 scope) |
| C7  | Group-chat VN party join/leave                                                         | `TASK-travel-party-migration.md`             | ▲ now                           | 🟡 **Phase 1 done 2026-08-19** (worktree `feature-c7-group-chat-vn-party` `d163cbe1`) — `joinParty`/`leaveParty` service + VN narration + `guest` role; Phases 3-4 (split/reunite/choice-card) open |
| G2  | World timeline forward-event steering + cross-story convergence              | `TASK-timeline-branching-ui.md`           | ▲ now                           | 🟡 **Service layer DONE 2026-09-10** (worktree `g2-timeline-steering`) — `world_event_steerings` table (now in `src/db/migrations/001_init.ts`) + `src/story/timeline/event-steering.ts` (create/roll/resolve/list, red-herring guard) + `getConvergentEvents`; 12 tests. OPEN: branching UI + `loreSection` injection |
| D3  | GM config type authoring (human/hybrid) + any further palette verbs           | `../priority-p0-p2.md`                        | ▲ now                           | 🟡 partial — palette hydrates from the live registry and the text tools (improve / rewrite / translate / summarize) ship as command buttons; what is still open is the human/hybrid GM-config authoring mode |

| R1  | **Resource Provision** — new epic: external compute/inference endpoints, encrypted credential store (BYOK), browser backup opt-in with SHA-256 hashing, per-resource quota engine, hash-based reconciliation/recovery. 12 tickets scoped. | `.plan/epics/epic-resource-provision.md` | ▲ now (planning) | 📝 Draft — 12 tasks; see `epic-resource-provision.md` and `.plan/tickets/TASK-resource-provision-*.md` |
| R2  | **Assistant Entity Access & Manipulation** — new epic: assistant access to RAG documents, assets, worlds, locations, characters, items, inventory; addition, modification, duplication, adaptation (outfit/knowledge/background for character in new world). 12 tickets scoped. | `.plan/epics/epic-assistant-entity-access.md` | ▲ now (planning) | 📝 Draft — 12 tasks; see `epic-assistant-entity-access.md` and `.plan/tickets/TASK-assistant-entity-access-*.md` |
| X2  | Refactor LLM provider adapters onto a shared base/factory (cross-cloned `index.ts` / `http.ts` in `src/generation/providers/{anthropic,ollama-native,openai-compatible}`) | `TASK-refactor-llm-provider-adapters-onto-shared-base-factory.md` | ▲ schedule with provider work | ⬜ open — re-homed here 2026-09-26; it was orphaned when the 2026-09-03 refactor cluster was retired. Coordinate with the federation/swarm provider tickets so they land on the new shape |

**Deferred (do not decide now):** F1 (9 AUX LLM enrichment tasks) · G3 (external music
linking) · G4 (authoring ownership indicators) — see `open-deferred.md`.

> **Dated history removed 2026-09-26** — the per-date next-actions sections (2026-08-15,
> 2026-08-16, 2026-09-01/02/03, 2026-09-10) are gone; their content lives in
> `open-closed.md`, the `../priority-*.md` tiers, and the ticket resolution blocks.

## 2026-09-11 core-finalization wave

> Scope: finish + iron out core application features for 0.1.0. Proposal-tier
> items (FEAT-059/060/062/065/066/067/075/045-047, embeddings, asset-consistency,
> keyphrase recall, encounter gen, emotion-avatar/wardrobe/asset-platform proposals,
> 2FA execution, R1/R2 draft epics, API versioning) stay parked — not this wave.

### F1 — wiring remainders (small, ticket-backed)

- `TASK-sessions-api-routes` — `/api/sessions` pending (P3 #2 remainder)
- `PERF-gallery-uploadChatAssets-sequential` — ✅ Done 2026-09-19 (already parallel via `Promise.allSettled`; 3 regression tests on dev)
- World/location search (P3 filtering row remainder)
- Detailed tuning frontend (P3 #13 remainder)

### F2 — feature remainders (medium, ticket-backed)

- C7 Phases 3–4 — party split/reunite engine + VN choice-card integration
  (`TASK-chat-branch-merge.md`, child of `TASK-travel-party-migration.md`)
- G2 remainder — timeline branching UI + `loreSection` injection
  (service layer shipped 2026-09-10; `TASK-timeline-branching-ui.md`)
- E2E gaps — `TEST-e2e-auth-flows-missing`, `TEST-e2e-nsfw-moderation-routes-missing`,
  `TEST-e2e-users-personas-routes-missing`

### Hygiene closed in this wave (planning only, no code)

- P2-Reconcile ✅ all 9 closed (statuses verified on dev)
- Audit Follow-up Cluster ✅ all 8 closed (resolves the 2026-09-03 open listing above)
- Status corrections: command palette ✅, LoRA ✅, fine-tuning UI ✅ (B10),
  unified GM↔assistant view ✅ (E1), creation wizards ✅ (C3), md links ✅,
  memory-selection UI shipped, VN-settings cluster resolved
- `plan:sync:fix` re-run to backfill done-statuses into `tickets/index.json`
  (e.g. palette WIRE verified-done but unindexed)

### Still blocking the 0.1.0 tag

- **A9** — tag v0.1.0 + push `dev`→`origin/dev` (human-only: tags + push reserved for human)
- **Size-strict ceiling** — regressed since the 2026-08-12 close-out; must be back under ceiling before A9 (`TASK-size-strict-debt`, `TASK-frontend-size-gate`, `TASK-promote-size-check-to-ci`)

Build Integrity Cluster closed 2026-09-03 (Bucket X, `4a1f56b8` + `1cddba36`) — no longer a blocker.
