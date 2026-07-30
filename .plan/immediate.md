# Immediate Plan

> **Last updated:** 2026-07-31 — P0/P1/P1.5 complete; P2-A foundation done; P2-B/C/D partial
> **Status:** P0 ✅ complete; P1 ✅ complete; P1.5 ✅ complete; P2 🟡 in progress

---

## P0 — Critical Path (Blocking)

| Priority | Epic / Task                                                    | Key Deliverables                                                                                                                                                                  | Status                                                                    |
| -------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **P0**   | **Data Integrity Phase 1** — Config Guards & Backend Selection | • Reject `sqlite` when `INSTANCE_COUNT > 1`<br>• Warn on network filesystem WAL path<br>• Fix stale MySQL claim in `architecture.md`                                              | ✅ Complete — `src/config/load.ts`, tests passing                         |
| **P0**   | **NSFW Moderation Safety Infrastructure**                      | • NSFW enable/disable per chat/user/world<br>• Non-public audit log of NSFW gate decisions<br>• Consent state tracking (from Shared Schemas)<br>• Generation boundary integration | ✅ Complete — `src/nsfw/moderation-service.ts`, 14 endpoints, 3 DB tables |
| **P0**   | **Shared Schemas** — Reputation, Consent, NSFW Rating          | • Unified `ReputationScore` (Social, Faction, NSFW)<br>• Unified `ConsentState` (NSFW + Chat Lifecycle)<br>• `NSFWContentRating` runtime enforcement at generation boundary       | ✅ Complete — `src/schemas/` implemented                                  |

---

## P1 — High Priority (Post-P0)

| Priority | Epic / Task                                                           | Key Deliverables                                                                                                                                                                                                  | Status                                      |
| -------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| **P1**   | **Memory Tiers Wiring** — Selection UI, Lorebook, Cross-Chat          | • Memory selection UI (pinning, mid-chat panel)<br>• Lorebook activation with cooldowns<br>• Cross-chat memory persistence across workspaces<br>• Full generation pipeline integration                            | ✅ Complete                                 |
| **P1**   | **NSFW Integration Gaps** — Housing, Weather, Social, Disease         | • Housing: private spaces → encounter modifiers<br>• Weather: mood/pheromone/location availability<br>• Social: shared reputation, skill prerequisites<br>• Disease: reproductive health, STD transmissions        | ✅ Complete                                 |
| **P1**   | **Battle Integration Gaps** — Items, Social, NPC, Weather, Resolution | • Equipment stats → combat modifiers<br>• Social skills (intimidate/negotiate) in combat<br>• NPC personality-driven AI<br>• Weather/terrain environmental modifiers<br>• Unified dice resolution for all systems | ✅ Complete — `src/battle/` (54KB, 6 files) |
| **P1**   | **Data Integrity Phase 2** — `data_version` Optimistic Concurrency    | • `UPDATE ... WHERE data_version = ?` on high-contention tables<br>• `409 Conflict` on version mismatch<br>• Unit + integration tests                                                                             | ✅ Complete                                 |

> P1 complete as of 2026-07-30. All 4 items done.

---

## P1.5 — Accessibility

| Priority | Epic / Task                        | Key Deliverables                                                                                                                                                                      | Status       | Effort | Ticket |
| -------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------ | ------ |
| **P1.5** | **Accessibility — remaining gaps** | • `focus-visible` CSS on all focusable elements<br>• Focus trap for modals<br>• Skip links<br>• Screen reader live regions<br>• Touch gesture library<br>• 44×44px mobile tap targets | 🟡 ~60% done | Medium | —      |

**Next action**: Create `src/frontend/a11y/` module — focus-manager, touch-gestures, screen-reader utils, responsive helpers. Then add `a11y.css` (focus-visible, reduced-motion, high-contrast). Then wire skip links and modal focus traps in existing HTML templates.

---

## P2 — Core Workstream (Next Work)

| Priority | Epic                 | Key Deliverables                                                                | Status         | Ticket(s)                                                                                                                                                                                                |
| -------- | -------------------- | ------------------------------------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P2**   | **RPG Mechanics**    | Dice engine, stat system, combat engine, XP/loot                                | ⬜ Not Started | [`TASK-rpg-mechanics-dice-stats.md`](TASK-rpg-mechanics-dice-stats.md), [`TASK-rpg-mechanics-combat.md`](TASK-rpg-mechanics-combat.md), [`TASK-rpg-mechanics-xp-loot.md`](TASK-rpg-mechanics-xp-loot.md) |
| **P2**   | **Character System** | Multi-personality switching, mood/happiness meter, memory injection probability | ⬜ Not Started | [`TASK-character-system-p2.md`](TASK-character-system-p2.md)                                                                                                                                             |
| **P2**   | **World Locations**  | Location discovery, travel time, world NPC integration                          | ⬜ Not Started | [`TASK-world-locations.md`](TASK-world-locations.md), [`TASK-exploration-discovery.md`](TASK-exploration-discovery.md)                                                                                   |

### P2 — Priority Tiers

| Tier      | Topic                                | Ticket(s)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Status                            |
| --------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| **P2-A**  | **Visual Novel Mode**                | [`TASK-visual-novel-mode.md`](TASK-visual-novel-mode.md), [`TASK-chat-visual-novel-mode.md`](TASK-chat-visual-novel-mode.md), [`TASK-vn-branching-choices.md`](TASK-vn-branching-choices.md), [`TASK-vn-dynamic-generation.md`](TASK-vn-dynamic-generation.md), [`TASK-vn-qa-mode.md`](TASK-vn-qa-mode.md), [`TASK-vn-scene-template-system.md`](TASK-vn-scene-template-system.md), [`TASK-vn-template-actions.md`](TASK-vn-template-actions.md)                                                                                                                             | 🟡 Foundation done                |
| **P2-B**  | **Chat System**                      | [`TASK-chat-autorenaming.md`](TASK-chat-autorenaming.md), [`TASK-chat-backgrounds-location-sync.md`](TASK-chat-backgrounds-location-sync.md), [`TASK-chat-external-music-linking.md`](TASK-chat-external-music-linking.md), [`TASK-chat-room-search-join.md`](TASK-chat-room-search-join.md), [`TASK-chat-room-filters.md`](TASK-chat-room-filters.md), [`TASK-chat-message-search.md`](TASK-chat-message-search.md), [`TASK-chat-sectioning-multi-location.md`](TASK-chat-sectioning-multi-location.md), [`TASK-chat-transfer-location.md`](TASK-chat-transfer-location.md) | ⬜ Not Started                    |
| **P2-C**  | **Assistant & Tool Calling**         | [`TASK-assistant-commands-extension.md`](TASK-assistant-commands-extension.md), [`TASK-assistant-command-execution-intent-detection.md`](TASK-assistant-command-execution-intent-detection.md), [`TASK-assistant-gm-flows.md`](TASK-assistant-gm-flows.md), [`TASK-assistant-gm-flows-reconciliation.md`](TASK-assistant-gm-flows-reconciliation.md), [`TASK-wire-gm-service-story-mode.md`](TASK-wire-gm-service-story-mode.md)                                                                                                                                             | 🟡 Command buttons expanded       |
| **P2-D**  | **GM Flows**                         | [`TASK-assistant-gm-flows.md`](TASK-assistant-gm-flows.md), [`TASK-gm-shadow-notes.md`](TASK-gm-shadow-notes.md), [`TASK-gm-whitenotes.md`](TASK-gm-whitenotes.md), [`TASK-assistant-gm-flows-reconciliation.md`](TASK-assistant-gm-flows-reconciliation.md)                                                                                                                                                                                                                                                                                                                 | 🟡 Frontend done, backend pending |
| **P2-Da** | **GM-Guided Story Creation** _(NEW)_ | [TASK-gm-guided-story-creation.md](TASK-gm-guided-story-creation.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | ⬜ Not Started                    |
| **P2-E**  | **Authorization & Access**           | [`TASK-auth-register-route.md`](TASK-auth-register-route.md), [`TASK-two-factor-multi-factor-auth.md`](TASK-two-factor-multi-factor-auth.md), [`TASK-encryption-access-management.md`](TASK-encryption-access-management.md), [`TASK-dedupe-message-access-checks.md`](TASK-dedupe-message-access-checks.md), [`TASK-fix-message-reactions-access.md`](TASK-fix-message-reactions-access.md), [`TASK-authoring-creation.md`](TASK-authoring-creation.md)                                                                                                                     | ⬜ Not Started                    |
| **P2-F**  | **Gallery**                          | [`TASK-gallery-minimal-image-asset-viewer.md`](TASK-gallery-minimal-image-asset-viewer.md), [`TASK-config-gallery-attachment-idempotent.md`](TASK-config-gallery-attachment-idempotent.md)                                                                                                                                                                                                                                                                                                                                                                                   | ⬜ Not Started                    |

---

### P2-A — Visual Novel Mode

**Epic**: `epic-visual-novel-mode.md` — Backend `src/story/` exists (6 story route files); **frontend foundation complete** (2026-07-31).

#### Frontend Status

| Component          | Status     | File                                                 |
| ------------------ | ---------- | ---------------------------------------------------- |
| Scene renderer     | ✅ Done    | `src/frontend/vn/scene-renderer.ts`                  |
| Portrait manager   | ✅ Done    | `src/frontend/vn/portrait-manager.ts`                |
| Transition engine  | ✅ Done    | `src/frontend/vn/transition-engine.ts`               |
| Typewriter         | ✅ Done    | `src/frontend/vn/typewriter.ts`                      |
| Settings           | ✅ Done    | `src/frontend/vn/settings.ts`                        |
| CSS                | ✅ Done    | `src/frontend/vn/styles.css` + appended to `app.css` |
| GmConfig extension | ✅ Done    | `chat-types.ts` (12 VN fields)                       |
| Chat settings UI   | ✅ Done    | `chat-settings-modal.html`                           |
| Chat.html wiring   | ❌ Pending | Conditional VN vs bubble layout                      |
| Image preloading   | ❌ Pending | —                                                    |

- [x] Wire `src/frontend/vn/` scene renderer with image overlay + CSS transitions
- [x] Add typewriter animation component (`src/frontend/vn/typewriter.ts`)
- [x] Implement transition engine (fade/cut/dissolve/slide/wipe)
- [x] Implement portrait manager (left/right/center positioning)
- [x] Add VN settings UI to chat-settings-modal.html
- [x] Wire VN settings load/save in chat-settings.ts
- [ ] Wire VN mode into `chat.html` (conditional VN vs bubble layout)
- [ ] Implement branching choices system (`TASK-vn-branching-choices.md`)
- [ ] Implement dynamic generation for VN scenes (`TASK-vn-dynamic-generation.md`)
- [ ] Build QA mode for VN content validation (`TASK-vn-qa-mode.md`)
- [ ] Create scene template system (`TASK-vn-scene-template-system.md`)
- [ ] Implement template actions (auto-fill, variables, conditions) (`TASK-vn-template-actions.md`)
- [ ] **Verification**: `bun run check && bun test src/story/`

---

### P2-B — Chat System

#### Frontend Gap Tasks (file-level evidence)

| Gap | Evidence File | What to Build |
| --- | --- | --- |
| Chat types exist | `src/frontend/alpine/chat-types.ts` — `ChatState`, `GmConfig`, `Message`, `MessageAttachment`, `GroupedMessage`, `RpgStats`, `MemoryPanelState` (571 lines) | Extend `ChatState` with chat UI state for new features |
| Command buttons (tool calling UI) | `src/frontend/alpine/command-buttons.ts` — exists (27 buttons: image, video, sfx, music, caption, improve, quest, roll) — **only tool calling UI, no command parser** | Wire `/` slash command parser; expand command palette |
| GM role switching exists | `src/frontend/alpine/chat-settings.ts` — `_assistantRole: "off"`, `chat?.gm_config` parsed with `GmConfig` type (line 33-36) | Build GM role switching UI (dropdown: off/helper/gm/moderator) |
| Auth basics exist | `src/frontend/fe-fetch.ts` — CSRF + session token injection, 401 redirect to login | Build login/register pages that use `feFetch` |
| Admin user mgmt exists | `src/frontend/alpine/admin-users.ts` — role editing, user list, pagination, search, filter | Extend with access control panels |
| Gallery page exists | `src/frontend/pages/gallery.ts` — search, preview, download, delete, type filtering (image/audio/video) | Wire `src/routes/gallery.ts` backend route (missing) |
| Chat room management | `docs/frontend/chat/overview.md` | Room list, create/rename/delete room components |
| Chat autorenaming | `TASK-chat-autorenaming.md` | Auto-label chat sessions based on first exchange |
| Chat backgrounds + location sync | `TASK-chat-backgrounds-location-sync.md` | Background image picker; location indicator in chat header |
| External music linking | `TASK-chat-external-music-linking.md` | Music embed component (browser-native `<audio>` or iframe) |
| Room search & join | `TASK-chat-room-search-join.md`, `docs/frontend/chat/search-and-filter.md` | Searchable room list, join via htmx |
| Room filters | `TASK-chat-room-filters.md` | Filter rooms by world, character, date |
| Message search & filter | `TASK-chat-message-search.md`, `docs/frontend/chat/search-and-filter.md` | In-chat message search with highlight |
| Multi-location sectioning | `TASK-chat-sectioning-multi-location.md` | Location tabs/segments in chat view |
| Chat transfer + location change | `TASK-chat-transfer-location.md`, `FEAT-chat-transfer-location-change.md` | Transfer chat between characters/worlds UI |
| Group chat UI | `docs/frontend/chat/group-chat.md` (194 lines, partially implemented) | Multi-participant chat view, participant list, side-chat creation |
| Assistant panel | `docs/frontend/chat/assistant.md` (147 lines, designed but not implemented) | Assistant context panel in chat sidebar |
| Message actions | `docs/frontend/chat/message-actions.md` | Edit, delete, pin, react to messages in UI |

- [ ] Wire command buttons (`src/frontend/alpine/command-buttons.ts`) into slash command parser (`TASK-assistant-commands-extension.md`)
- [ ] Build GM role switching UI from existing `_assistantRole` field in `chat-settings.ts`
- [ ] Build registration form frontend page (`docs/frontend/login.md`, 41 lines) using `feFetch` (`src/frontend/fe-fetch.ts`)
- [ ] Build login page with htmx submission using `feFetch` auth flow
- [ ] Implement chat autorenaming (`TASK-chat-autorenaming.md`)
- [ ] Implement chat backgrounds + location sync (`TASK-chat-backgrounds-location-sync.md`)
- [ ] Implement external music linking (`TASK-chat-external-music-linking.md`)
- [ ] Wire chat room search & join (`TASK-chat-room-search-join.md`)
- [ ] Implement chat room filters (`TASK-chat-room-filters.md`)
- [ ] Implement chat message search & filter (`TASK-chat-message-search.md`)
- [ ] Implement multi-location chat sectioning (`TASK-chat-sectioning-multi-location.md`)
- [ ] Implement chat transfer + location change (`TASK-chat-transfer-location.md`)
- [ ] Wire group chat UI (`docs/frontend/chat/group-chat.md`)
- [ ] Wire assistant panel into chat sidebar (`docs/frontend/chat/assistant.md`)
- [ ] Wire message actions UI — edit, delete, pin, react (`docs/frontend/chat/message-actions.md`)
- [ ] **Verification**: `bun run check && bun test src/routes/`

---

### P2-C — Assistant & Tool Calling

#### Frontend Gap Tasks (file-level evidence)

| Gap | Evidence File | What to Build |
| --- | --- | --- |
| Assistant role types exist | `src/frontend/alpine/chat-types.ts` line 125-129: `GmConfig` with `assistantRole?: "off" | "helper" | "gm" | "moderator"` | Build UI to switch assistant role per chat |
| `_assistantRole` field exists | `src/frontend/alpine/chat-settings.ts` line 15: `_assistantRole: "off"` — stored but not exposed in UI | Expose role dropdown in chat settings panel |
| Command buttons exist | `src/frontend/alpine/command-buttons.ts` — 8 functional buttons (image, video, sfx, music, caption, improve, quest, roll) | Expand command palette; add text generation commands (summarize, rewrite, translate) |
| Chat settings page exists | `src/frontend/alpine/chat-settings.ts` — chat settings modal with mode, turn strategy, streaming, persona, impersonation | Add assistant role + GM config to settings modal |
| Tool calling display | — | Show function calls, parameters, and LLM tool results in chat bubbles |
| GM service wiring | `TASK-wire-gm-service-story-mode.md` | Connect GM service to assistant for story-mode responses |
| Assistant ↔ GM reconciliation | `TASK-assistant-gm-flows-reconciliation.md` | Unified assistant/GM interface in chat UI |

- [ ] Expose GM role switching (`"off" | "helper" | "gm" | "moderator"`) in chat settings UI (uses existing `_assistantRole` + `GmConfig` from `chat-types.ts`)
- [ ] Expand command buttons (`src/frontend/alpine/command-buttons.ts`) with text generation commands for assistant
- [ ] Add assistant role selector to chat settings modal (`chat-settings.ts`)
- [ ] Implement assistant command execution with intent detection (`TASK-assistant-command-execution-intent-detection.md`)
- [ ] Wire slash commands (`/`) into assistant pipeline (`TASK-assistant-commands-extension.md`)
- [ ] Implement assistant tool calling display (function-call UI in chat — show tool call + params + result in message bubbles)
- [ ] Integrate GM service into assistant flow (`TASK-wire-gm-service-story-mode.md`)
- [ ] Reconcile assistant ↔ GM flow interfaces (`TASK-assistant-gm-flows-reconciliation.md`)
- [ ] **Verification**: `bun run check && bun test src/assistant/`

---

### P2-D — GM Flows

#### Frontend Status

| Component                   | Status     | File                                        |
| --------------------------- | ---------- | ------------------------------------------- |
| GM panel sidebar            | ✅ Done    | `src/components/chat/gm-panel.html`         |
| Shadow notes UI             | ✅ Done    | `src/frontend/alpine/gm-panel.ts`           |
| Whitenotes UI               | ✅ Done    | `src/frontend/alpine/gm-panel.ts`           |
| GmConfig GM fields          | ✅ Done    | `chat-types.ts` (gmTurnOrder, questEnabled) |
| Shadow notes API routes     | ❌ Pending | DB table + routes                           |
| Whitenotes API routes       | ❌ Pending | DB table + routes                           |
| GM role switching UI wiring | ❌ Pending | —                                           |

- [x] Extend `GmConfig` type in `chat-types.ts` with story-mode fields (gm_role, turn_order, quest_enabled)
- [x] Implement GM shadow notes frontend panel (`TASK-gm-shadow-notes.md`)
- [x] Implement GM whitenotes frontend panel (`TASK-gm-whitenotes.md`)
- [ ] Implement GM shadow notes API routes + DB table
- [ ] Implement GM whitenotes API routes + DB table
- [ ] Wire GM panels into chat UI (story mode frontend) — `docs/frontend/chat/multi-llm-story.md` (521 lines, spec complete)
- [ ] Wire GM ↔ assistant unified view in chat (`TASK-assistant-gm-flows-reconciliation.md`)
- [ ] Build quest log UI component (links to `src/story/` quest engine)
- [ ] **Verification**: `bun run check`

---

### P2-Da — GM-Guided Story Creation *(NEW)*

**Ticket**: [`TASK-gm-guided-story-creation.md`](TASK-gm-guided-story-creation.md)

> The user acts as Game Master, guiding LLM characters in chat or group-chat to collaboratively generate a story. This extends the existing GM flows (P2-D) with a specific UX: the user has direct control over narrative direction while LLMs handle character voices and scene details.

#### Why This Is a Natural Extension

The existing infrastructure already supports this pattern:
- **Group chat** (`docs/frontend/chat/group-chat.md`, 194 lines) supports multiple participants. Adding a "user-GM" participant type is an extension, not a new pattern.
- **GM role** (`GmConfig.assistantRole = "gm"`) already exists in `src/frontend/alpine/chat-types.ts` line 125-129. The `moderator` variant handles enforcement; the `gm` variant needs narrative guidance UX.
- **Story mode** (`src/story/`, 6 backend files) has turn orchestration. The GM-guided variant makes the user the turn orchestrator instead of the system.
- **Assistant as GM** (`docs/frontend/chat/assistant.md`) describes the GM role as "orchestrates the session: turn order, response evaluation." The user-GM variant gives that power to the human.

#### Design

| Concept | Implementation | File |
| --- | --- | --- |
| User as GM participant | New chat participant type `"gm"` in group chat | `src/frontend/alpine/chat-types.ts` (extend GroupChatParticipant type) |
| GM guidance commands | `/guide` slash command to give narrative direction to characters | `src/frontend/alpine/command-buttons.ts` (add guide button) |
| Character response steering | GM can prompt specific characters or set narrative constraints | `src/frontend/alpine/chat-settings.ts` (GM guidance panel) |
| Story arc tracking | Lightweight story arc list visible in GM panel | `docs/frontend/chat/multi-llm-story.md` (use existing quest/state infrastructure) |
| Group chat + GM integration | GM controls turn order in group chat; characters respond in sequence | `docs/frontend/chat/group-chat.md` (22) |

**Frontend Gap Files**:
- `src/frontend/alpine/chat-types.ts` — extend participant types to include `"gm"` role
- `src/frontend/alpine/command-buttons.ts` — add `/guide` command button
- `src/frontend/alpine/chat-settings.ts` — add GM guidance panel (narrative constraints, character targeting)
- `src/frontend/alpine/chat.ts` — wire GM turn-order control into group chat message flow
- `docs/frontend/chat/group-chat.md` — document GM-guided story variant

- [ ] Extend participant types in `chat-types.ts` to include user-as-GM role
- [ ] Add `/guide` command button to `command-buttons.ts` with narrative direction input
- [ ] Add GM guidance panel to `chat-settings.ts` (narrative constraints, character targeting, turn control)
- [ ] Wire GM turn-order control into group chat message flow (`chat.ts`)
- [ ] Document GM-guided story variant in `group-chat.md` spec
- [ ] **Verification**: `bun run check`

---

### P2-E — Authorization & Access

#### Frontend Gap Tasks (file-level evidence)

| Gap | Evidence File | What to Build |
| --- | --- | --- |
| Auth route exists | `src/routes/auth.ts` has `POST /api/auth/register` and login endpoints | Frontend pages for these endpoints |
| feFetch handles 401 | `src/frontend/fe-fetch.ts` — redirects to `/views/login` on 401 | Build the `/views/login` page (referenced but may not exist) |
| Admin user mgmt exists | `src/frontend/alpine/admin-users.ts` — role editing, user list, search/filter | Extend with MFA management, access control panels |
| `GmConfig` assistantRole | `chat-types.ts` — `assistantRole?: "off" | "helper" | "gm" | "moderator"` | Access gating per role (which features are visible) |
| Encryption exists | `src/frontend/browser-crypto.ts` — browser-side AES | Show encryption status in access control UI |
| Access check gaps | `TASK-dedupe-message-access-checks.md`, `TASK-fix-message-reactions-access.md` | UI-level access check feedback |

- [ ] Build registration form frontend page using `feFetch` (`src/frontend/fe-fetch.ts`) — `POST /api/auth/register`
- [ ] Build login page with htmx submission using `feFetch` auth flow
- [ ] Implement two-factor/MFA auth with setup UI (`TASK-two-factor-multi-factor-auth.md`)
- [ ] Implement message-level access check UI (`TASK-dedupe-message-access-checks.md`)
- [ ] Implement encryption + access management display (`TASK-encryption-access-management.md`)
- [ ] Fix message reactions access check in UI (`TASK-fix-message-reactions-access.md`)
- [ ] Implement authoring/creation ownership indicators (`TASK-authoring-creation.md`)
- [ ] **Verification**: `bun run check && bun test src/routes/auth.ts src/auth/`

---

### P2-F — Gallery

#### Frontend Gap Tasks (file-level evidence)

| Gap | Evidence File | What to Build |
| --- | --- | --- |
| Gallery page exists | `src/frontend/pages/gallery.ts` — search, preview (lightbox), download, delete, type filter (image/audio/video), card filtering via `filterCards()` (82 lines) | Backend route + wire into navigation |
| Gallery route MISSING | `src/routes/gallery.ts` does NOT exist — no API route to serve gallery data | Create `src/routes/gallery.ts` backend route |
| Attachment ID issue | `TASK-config-gallery-attachment-idempotent.md` — duplicate upload handling | Fix duplicate attachment ID handling in `gallery.ts` upload flow |
| Gallery wiring | — | Gallery tab in character detail, story view navigation |

- [ ] Create `src/routes/gallery.ts` — gallery API route (does not exist)
- [ ] Wire gallery route into navigation so `src/frontend/pages/gallery.ts` is reachable
- [ ] Implement minimal image asset viewer improvements (`TASK-gallery-minimal-image-asset-viewer.md`)
- [ ] Make gallery attachment ID handling idempotent (`TASK-config-gallery-attachment-idempotent.md`)
- [ ] Wire gallery into character and story views (add attachments tab)
- [ ] **Verification**: `bun run check`

---

### P2-later — RPG Mechanics (deferred from earlier plan)

Tickets: `TASK-rpg-mechanics-dice-stats.md`, `TASK-rpg-mechanics-combat.md`, `TASK-rpg-mechanics-xp-loot.md`

Deferred until P2-A through P2-F (including the new GM-guided story creation task) are in progress or complete.

---

## P3 — Advanced Features (Post-P2)

| Priority | Epic                    | Key Deliverables                               | Status         | Ticket(s)                                                                                                                                                                    |
| -------- | ----------------------- | ---------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P3**   | **Artifact System**     | Code/docs/datasets as assets                   | ⬜ Not Started | [`TASK-artifact-system.md`](TASK-artifact-system.md)                                                                                                                         |
| **P3**   | **Visual Novel Mode**   | Image + text overlay, transitions, typewriter  | ⬜ Not Started | [`TASK-visual-novel-mode.md`](TASK-visual-novel-mode.md), [`TASK-chat-visual-novel-mode.md`](TASK-chat-visual-novel-mode.md)                                                 |
| **P3**   | **Plugin Ecosystem**    | Plugin management API, marketplace, sandboxing | ⬜ Not Started | [`TASK-plugin-system.md`](TASK-plugin-system.md), [`TASK-plugin-management-api.md`](TASK-plugin-management-api.md), [`TASK-plugin-api-system.md`](TASK-plugin-api-system.md) |
| **P3**   | **Three-Tier Memory**   | Episodic/semantic/procedural memory tiers      | ⬜ Not Started | [`FEAT-memory-systems-three-tier.md`](FEAT-memory-systems-three-tier.md)                                                                                                     |
| **P3**   | **ComfyUI Integration** | Node discovery, workflow templates             | ⬜ Not Started | [`TASK-comfyui-node-discovery.md`](TASK-comfyui-node-discovery.md), [`FEAT-comfyui-plugin-workflow-templates.md`](FEAT-comfyui-plugin-workflow-templates.md)                 |
| **P3**   | **Provider Ecosystem**  | Anthropic/Ollama/Bedrock support               | ⬜ Not Started | [`FEAT-provider-plugin-ecosystem.md`](FEAT-provider-plugin-ecosystem.md)                                                                                                     |

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
| **Gate A** | Post-P0 | ✅ All P0 items complete: Data Integrity Phase 1, NSFW moderation safety infra, Shared Schemas enforced                                                                                          |
| **Gate B** | Post-P1 | Import/Export + Admin functional with encryption; NSFW integrations complete; Battle integrations complete; Data Integrity Phase 2 complete; Memory tiers wired with UI + cross-chat persistence |
| **Gate C** | Post-P2 | VN mode wired; chat system functional; assistant + tool calling integrated; GM flows operational; GM-guided story creation implemented; auth/access controls live; gallery usable                                                   |
| **Gate D** | Post-P3 | Advanced features + plugin ecosystem operational                                                                                                                                                 |

---

## Notes

- **P0 items are blocking** — no safe multi-instance deployment without Data Integrity Phase 1; no NSFW content without moderation infrastructure; no cross-system data integrity without Shared Schemas
- **P2 emphasis**: VN mode → chat → assistant/tool calling → GM flows → GM-guided story creation → authorization/access → gallery. RPG mechanics deferred to P2-later.
- **VN mode is the highest P2 priority** — backend (`src/story/`, 6 route files) exists; frontend page does not. Start with `src/frontend/pages/visual-novel.ts`.
- **Chat system ties directly to assistant and GM flows** — implement in order: chat → assistant → GM → GM-guided story. Chat frontend has the most existing infrastructure (htmx + Alpine.js).
- **Authorization + access are blocking** — no safe multi-user deployment without register route, MFA, and access checks. `src/routes/auth.ts` has the route; frontend login/register pages need building.
- **Gallery** — `src/frontend/pages/gallery.ts` exists (82 lines, functional search/preview/download/delete) but `src/routes/gallery.ts` does not. Low-effort, high-visibility.
- **GM-guided story creation** is a natural extension of existing GM flows — the user becomes the turn orchestrator while LLMs handle character voices. Uses existing `group-chat.md` infrastructure, `GmConfig` types, and story-mode backend.
- **Frontend architecture** — all new frontend work uses htmx + Alpine.js per project conventions (`AGENTS.md`). New `.ts` modules in `src/frontend/alpine/` or `.ts` pages in `src/frontend/pages/`.
- **Key existing frontend files reused across P2**:

  | File                                     | Purpose                                                                                                    | P2 Tier     |
  | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------- |
  | `src/frontend/alpine/chat-types.ts`      | `GmConfig`, `ChatState`, `Message`, `RpgStats`, `MemoryPanelState` types                                   | A, C, D, Da |
  | `src/frontend/alpine/command-buttons.ts` | Command button toolbar with 8 functional buttons (image, video, sfx, music, caption, improve, quest, roll) | C, Da       |
  | `src/frontend/alpine/chat-settings.ts`   | Chat settings modal with `_assistantRole`, `gm_config` parsing, persona/impersonation                      | C, D, Da    |
  | `src/frontend/fe-fetch.ts`               | Unified fetch with CSRF/session token injection, 401 redirect                                              | E           |
  | `src/frontend/alpine/admin-users.ts`     | Admin user list, role editing, pagination, search/filter                                                   | E           |
  | `src/frontend/pages/gallery.ts`          | Gallery page with search, preview, download, delete, type filtering                                        | F           |
- **Reconciliation complete** — backlog/roadmap now reflect actual implementation state (see `backlog.md`)
