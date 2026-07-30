# Immediate Plan

> **Last updated:** 2026-07-30 — P0/P1 complete; P2 reordered by emphasis
> **Status:** P0 foundations in progress; P1 complete; P2 next

---

## P0 — Critical Path (Blocking)

| Priority | Epic / Task                                                    | Key Deliverables                                                                                                                                                                  | Status                                             |
| -------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| **P0**   | **Data Integrity Phase 1** — Config Guards & Backend Selection | • Reject `sqlite` when `INSTANCE_COUNT > 1`<br>• Warn on network filesystem WAL path<br>• Fix stale MySQL claim in `architecture.md`                                              | ✅ Complete — `src/config/load.ts`, tests passing |
| **P0**   | **NSFW Moderation Safety Infrastructure**                      | • NSFW enable/disable per chat/user/world<br>• Non-public audit log of NSFW gate decisions<br>• Consent state tracking (from Shared Schemas)<br>• Generation boundary integration | 🟡 Partial — mechanics exist, safety infra missing |
| **P0**   | **Shared Schemas** — Reputation, Consent, NSFW Rating          | • Unified `ReputationScore` (Social, Faction, NSFW)<br>• Unified `ConsentState` (NSFW + Chat Lifecycle)<br>• `NSFWContentRating` runtime enforcement at generation boundary       | ✅ Complete — `src/schemas/` implemented           |

---

## P1 — High Priority (Post-P0)

| Priority | Epic / Task                                                           | Key Deliverables                                                                                                                                                                                                  | Status                                      |
| -------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| **P1**   | **Memory Tiers Wiring** — Selection UI, Lorebook, Cross-Chat          | • Memory selection UI (pinning, mid-chat panel)<br>• Lorebook activation with cooldowns<br>• Cross-chat memory persistence across workspaces<br>• Full generation pipeline integration                            | ✅ Complete                                 |
| **P1**   | **NSFW Integration Gaps** — Housing, Weather, Social, Disease         | • Housing: private spaces → encounter modifiers<br>• Weather: mood/pheromone/location availability<br>• Social: shared reputation, skill prerequisites<br>• Disease: reproductive health, STD transmission        | ✅ Complete                                 |
| **P1**   | **Battle Integration Gaps** — Items, Social, NPC, Weather, Resolution | • Equipment stats → combat modifiers<br>• Social skills (intimidate/negotiate) in combat<br>• NPC personality-driven AI<br>• Weather/terrain environmental modifiers<br>• Unified dice resolution for all systems | ✅ Complete — `src/battle/` (54KB, 6 files) |
| **P1**   | **Data Integrity Phase 2** — `data_version` Optimistic Concurrency    | • `UPDATE ... WHERE data_version = ?` on high-contention tables<br>• `409 Conflict` on version mismatch<br>• Unit + integration tests                                                                             | ✅ Complete                                 |

> P1 complete as of 2026-07-30. All 4 items done.

---

## P1.5 — Accessibility (Next after P0 residual)

| Priority | Epic / Task                        | Key Deliverables                                                                                                                                                                      | Status       | Effort |
| -------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------ |
| **P1.5** | **Accessibility — remaining gaps** | • `focus-visible` CSS on all focusable elements<br>• Focus trap for modals<br>• Skip links<br>• Screen reader live regions<br>• Touch gesture library<br>• 44×44px mobile tap targets | 🟡 ~60% done | Medium |

**Next action**: Create `src/frontend/a11y/` module — focus-manager, touch-gestures, screen-reader utils, responsive helpers. Then add `a11y.css` (focus-visible, reduced-motion, high-contrast). Then wire skip links and modal focus traps in existing HTML templates.

---

## P2 — Core Workstream (Next Work)

> **Emphasis**: VN mode, chat, assistant, tool calling, GM flows, authorization, access control, gallery. RPG mechanics deferred to P2-later.

### P2 — Priority Tiers

| Tier | Topic | Ticket(s) | Status |
| ---- | ----- | --------- | ------ |
| **P2-A** | **Visual Novel Mode** | [`TASK-visual-novel-mode.md`](TASK-visual-novel-mode.md), [`TASK-chat-visual-novel-mode.md`](TASK-chat-visual-novel-mode.md), [`TASK-vn-branching-choices.md`](TASK-vn-branching-choices.md), [`TASK-vn-dynamic-generation.md`](TASK-vn-dynamic-generation.md), [`TASK-vn-qa-mode.md`](TASK-vn-qa-mode.md), [`TASK-vn-scene-template-system.md`](TASK-vn-scene-template-system.md), [`TASK-vn-template-actions.md`](TASK-vn-template-actions.md) | ⬜ Not Started |
| **P2-B** | **Chat System** | [`TASK-chat-autorenaming.md`](TASK-chat-autorenaming.md), [`TASK-chat-backgrounds-location-sync.md`](TASK-chat-backgrounds-location-sync.md), [`TASK-chat-external-music-linking.md`](TASK-chat-external-music-linking.md), [`TASK-chat-room-search-join.md`](TASK-chat-room-search-join.md), [`TASK-chat-room-filters.md`](TASK-chat-room-filters.md), [`TASK-chat-message-search.md`](TASK-chat-message-search.md), [`TASK-chat-sectioning-multi-location.md`](TASK-chat-sectioning-multi-location.md), [`TASK-chat-transfer-location.md`](TASK-chat-transfer-location.md) | ⬜ Not Started |
| **P2-C** | **Assistant & Tool Calling** | [`TASK-assistant-commands-extension.md`](TASK-assistant-commands-extension.md), [`TASK-assistant-command-execution-intent-detection.md`](TASK-assistant-command-execution-intent-detection.md), [`TASK-assistant-gm-flows.md`](TASK-assistant-gm-flows.md), [`TASK-assistant-gm-flows-reconciliation.md`](TASK-assistant-gm-flows-reconciliation.md), [`TASK-wire-gm-service-story-mode.md`](TASK-wire-gm-service-story-mode.md) | ⬜ Not Started |
| **P2-D** | **GM Flows** | [`TASK-assistant-gm-flows.md`](TASK-assistant-gm-flows.md), [`TASK-gm-shadow-notes.md`](TASK-gm-shadow-notes.md), [`TASK-gm-whitenotes.md`](TASK-gm-whitenotes.md), [`TASK-assistant-gm-flows-reconciliation.md`](TASK-assistant-gm-flows-reconciliation.md) | ⬜ Not Started |
| **P2-E** | **Authorization & Access** | [`TASK-auth-register-route.md`](TASK-auth-register-route.md), [`TASK-two-factor-multi-factor-auth.md`](TASK-two-factor-multi-factor-auth.md), [`TASK-encryption-access-management.md`](TASK-encryption-access-management.md), [`TASK-dedupe-message-access-checks.md`](TASK-dedupe-message-access-checks.md), [`TASK-fix-message-reactions-access.md`](TASK-fix-message-reactions-access.md), [`TASK-authoring-creation.md`](TASK-authoring-creation.md) | ⬜ Not Started |
| **P2-F** | **Gallery** | [`TASK-gallery-minimal-image-asset-viewer.md`](TASK-gallery-minimal-image-asset-viewer.md), [`TASK-config-gallery-attachment-idempotent.md`](TASK-config-gallery-attachment-idempotent.md) | ⬜ Not Started |

---

### P2-A — Visual Novel Mode (Start here)

**Epic**: `epic-visual-novel-mode.md` — Backend `src/story/` exists; frontend not started.

- [ ] Wire `src/story/` backend to new htmx/Alpine frontend
- [ ] Implement image overlay component with transition effects
- [ ] Add typewriter animation support
- [ ] Implement branching choices system (`TASK-vn-branching-choices.md`)
- [ ] Implement dynamic generation for VN scenes (`TASK-vn-dynamic-generation.md`)
- [ ] Build QA mode for VN content validation (`TASK-vn-qa-mode.md`)
- [ ] Create scene template system (`TASK-vn-scene-template-system.md`)
- [ ] Implement template actions (auto-fill, variables, conditions) (`TASK-vn-template-actions.md`)
- [ ] **Verification**: `bun run check && bun test src/story/`

### P2-B — Chat System

- [ ] Implement chat autorenaming (`TASK-chat-autorenaming.md`)
- [ ] Implement chat backgrounds + location sync (`TASK-chat-backgrounds-location-sync.md`)
- [ ] Implement external music linking (`TASK-chat-external-music-linking.md`)
- [ ] Wire chat room search & join (`TASK-chat-room-search-join.md`)
- [ ] Implement chat room filters (`TASK-chat-room-filters.md`)
- [ ] Implement chat message search & filter (`TASK-chat-message-search.md`)
- [ ] Implement multi-location chat sectioning (`TASK-chat-sectioning-multi-location.md`)
- [ ] Implement chat transfer + location change (`TASK-chat-transfer-location.md`)
- [ ] **Verification**: `bun run check && bun test src/routes/`

### P2-C — Assistant & Tool Calling

- [ ] Implement assistant command execution with intent detection (`TASK-assistant-command-execution-intent-detection.md`)
- [ ] Wire slash commands (`/`) into assistant pipeline (`TASK-assistant-commands-extension.md`)
- [ ] Implement assistant tool calling (function-calling pattern for LLM)
- [ ] Integrate GM service into assistant flow (`TASK-wire-gm-service-story-mode.md`)
- [ ] Reconcile assistant ↔ GM flow interfaces (`TASK-assistant-gm-flows-reconciliation.md`)
- [ ] **Verification**: `bun run check && bun test src/assistant/`

### P2-D — GM Flows

- [ ] Implement GM shadow notes system (`TASK-gm-shadow-notes.md`)
- [ ] Implement GM whitenotes (visible GM annotations) (`TASK-gm-whitenotes.md`)
- [ ] Wire GM panels into chat UI (story mode frontend)
- [ ] Reconcile GM ↔ assistant flow (`TASK-assistant-gm-flows-reconciliation.md`)
- [ ] **Verification**: `bun run check`

### P2-E — Authorization & Access

- [ ] Implement `POST /api/auth/register` route (`TASK-auth-register-route.md`) — currently not implemented
- [ ] Implement two-factor/MFA auth (`TASK-two-factor-multi-factor-auth.md`)
- [ ] Implement message-level access checks (`TASK-dedupe-message-access-checks.md`)
- [ ] Implement encryption + access management (`TASK-encryption-access-management.md`)
- [ ] Fix message reactions access check (`TASK-fix-message-reactions-access.md`)
- [ ] Implement authoring/creation ownership checks (`TASK-authoring-creation.md`)
- [ ] **Verification**: `bun run check && bun test src/routes/ src/auth/`

### P2-F — Gallery

- [ ] Implement minimal image asset viewer (`TASK-gallery-minimal-image-asset-viewer.md`)
- [ ] Make gallery attachment ID handling idempotent (`TASK-config-gallery-attachment-idempotent.md`)
- [ ] Wire gallery into character and story views
- [ ] **Verification**: `bun run check`

### P2-later — RPG Mechanics (deferred from earlier plan)

Tickets: `TASK-rpg-mechanics-dice-stats.md`, `TASK-rpg-mechanics-combat.md`, `TASK-rpg-mechanics-xp-loot.md`

Deferred until P2-A through P2-F are in progress or complete.

---

## P3 — Advanced Features (Post-P2)

| Priority | Epic                  | Key Deliverables                               | Status         | Ticket(s)                                                                                     |
| -------- | --------------------- | ---------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------- |
| **P3**   | **Plugin Ecosystem**  | Plugin management API, marketplace, sandboxing | ⬜ Not Started | [`TASK-plugin-system.md`](TASK-plugin-system.md), [`TASK-plugin-management-api.md`](TASK-plugin-management-api.md), [`TASK-plugin-api-system.md`](TASK-plugin-api-system.md) |
| **P3**   | **Three-Tier Memory** | Episodic/semantic/procedural memory tiers      | ⬜ Not Started | [`FEAT-memory-systems-three-tier.md`](FEAT-memory-systems-three-tier.md)                       |
| **P3**   | **Artifact System**   | Code/docs/datasets as assets                   | ⬜ Not Started | [`TASK-artifact-system.md`](TASK-artifact-system.md)                                          |
| **P3**   | **ComfyUI Integration** | Node discovery, workflow templates          | ⬜ Not Started | [`TASK-comfyui-node-discovery.md`](TASK-comfyui-node-discovery.md), [`FEAT-comfyui-plugin-workflow-templates.md`](FEAT-comfyui-plugin-workflow-templates.md) |
| **P3**   | **Provider Ecosystem** | Anthropic/Ollama/Bedrock support           | ⬜ Not Started | [`FEAT-provider-plugin-ecosystem.md`](FEAT-provider-plugin-ecosystem.md)                       |

### P3 — Next Actions (After P2 complete)

1. **Plugin Ecosystem**: Implement plugin management API (`install/list/enable/disable`). Build marketplace UI. Add sandboxing layer for plugin execution.
2. **Three-Tier Memory** (`FEAT-memory-systems-three-tier.md`): Design episodic/semantic/procedural table schema. Implement retrieval pipeline with tier-aware weighting. Add memory type enum.
3. **Artifact System** (`TASK-artifact-system.md`): Create `src/assets/artifact-handler.ts` — code/doc/dataset asset linking. Build `src/routes/artifacts.ts` with TypeBox response schemas. Add artifact gallery UI component.
4. **ComfyUI Integration**: Integrate ComfyUI node discovery and workflow template management.
5. **Provider Ecosystem**: Add Anthropic, Ollama, and Bedrock provider support alongside existing OpenAI-compatible provider.

---

## Milestone Gates

| Gate       | Trigger | Criteria                                                                                                                                                                                         |
| ---------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Gate A** | Post-P0 | All observability + testing infrastructure stable; Data Integrity Phase 1 complete; NSFW moderation live; Shared schemas enforced                                                                |
| **Gate B** | Post-P1 | Import/Export + Admin functional with encryption; NSFW integrations complete; Battle integrations complete; Data Integrity Phase 2 complete; Memory tiers wired with UI + cross-chat persistence |
| **Gate C** | Post-P2 | VN mode wired; chat system functional; assistant + tool calling integrated; GM flows operational; auth/access controls live; gallery usable                                                   |
| **Gate D** | Post-P3 | Advanced features + plugin ecosystem operational                                                                                                                                                 |

---

## Notes

- **P0 items are blocking** — no safe multi-instance deployment without Data Integrity Phase 1; no NSFW content without moderation infrastructure; no cross-system data integrity without Shared Schemas
- **P2 emphasis**: VN mode → chat → assistant/tool calling → GM flows → authorization/access → gallery. RPG mechanics deferred to P2-later stream.
- **VN mode is the highest P2 priority** — backend (`src/story/`) exists, frontend is the gap
- **Chat system ties directly to assistant and GM flows** — implement in order: chat → assistant → GM
- **Authorization + access are blocking** — no safe multi-user deployment without register route, MFA, and access checks
- **Gallery is a user-facing quality-of-life feature** — low effort, high visibility
- **Reconciliation complete** — backlog/roadmap now reflect actual implementation state (see `backlog.md`)
