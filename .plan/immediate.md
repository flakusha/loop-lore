# Immediate Plan

> **Last updated:** 2026-08-05 — 2026-08-05 audit: route wiring verified (all src/routes wired except gated LoRA); chat filters UI + setup-template selector UI shipped post-doc; GM role runtime effect in working tree (uncommitted); **P3–P5 restructured to the 0.1.0 highest-value features** (Core Foundation → Core Experience → Wiring/Search/Polish; non-value → P6+); added **Post-P3 — Road to Happy 0.1.0** gate below.
> **Status:** P0 ✅ complete; P1 ✅ complete; P1.5 ✅ complete; P2 🟡 in progress; Regex ✅ complete; **P3–P5 → 0.1.0 value tiers 🗺️ (see P3 section + Post-P3 below)**

---

## Next In-Progress — Decision Queue (2026-08-05)

> Every open/partial item across `backlog.md` + `immediate.md`, deduped, so finalize-vs-defer can be decided per row. **Recommend** = my proposal from the 0.1.0 value alignment (▲ finalize now / ▼ defer). **Decision** column left blank for the user. When a row is decided, move it: finalized → check off in its P2–P5 section; deferred → `backlog.md` `## P6+`.

| ID | Item | Ticket / where | Recommend | Decision |
| -- | ---- | -------------- | --------- | -------- |
| A1 | NSFW audit-log UI + consent display | P0 partial (`immediate.md` L37, L70) | ▲ now | |
| A2 | MFA (TOTP) + `/api/sessions` | `TASK-two-factor-multi-factor-auth.md` (P2-E) | ▼ defer | ▼ **Deferred 2026-08-05** — local server, local registrations, no external integrations — no auth overcomplication; draft/noop acceptable. Moved to `backlog.md` P6+ |
| A3 | Message/reaction access-check UI | `TASK-dedupe-message-access-checks.md`, `TASK-fix-message-reactions-access.md` | ▲ now | ▲ **Finalized shipped 2026-08-05** — POST reaction now gated via `checkChatAccess`; dedupe done; `message-reactions.test.ts` (8 tests) |
| A4 | Encryption + access-mgmt display | `TASK-encryption-access-management.md` (time-based expiry — separate/blocked feature); encryption/compression flow **already wired 2026-08-06** | ▲ done | ✅ **Value #4 already implemented** (2026-08-06 audit); remaining time-based-expiry access mgmt is blocked (P6+/separate epic) |
| A5 | Lint-ts debt (291 files) → `check` 16/17 | `immediate.md` L468 | ▲ now | |
| A6 | Size-strict debt (10 files) → `check` 17/17 | `immediate.md` L469 | ▲ now | |
| A7 | e2e browser stabilization (auth redirect-loop) | `immediate.md` L470 | ▲ now | |
| A8 | Unwired-code close-out (LoRA, dead `detectIntent`, swipe, GM-role effect) | `backlog.md` L112/L144+ | ▲ now | |
| A9 | Release artifacts (release-process, tag `v0.1.0`, changelog) | `immediate.md` L472 | ▲ now | |
| B1 | Registration frontend page | P2-B L186 | ▲ now | |
| B2 | Chat message search & filter | `TASK-chat-message-search.md` (P2-B/P4/P5) | ▲ now | |
| B3 | Chat transfer + location change | `TASK-chat-transfer-location.md` (P2-B/P4) | ▲ now | |
| B4 | Stop generation (chat+VN) | P5 | ▲ now | |
| B5 | Notification center + noise filtering | P5 | ▲ now | |
| B6 | IO export/import (PNG/YAML/TOML/CHARX; world/loc/story) | P4/P5 | ▲ now | |
| B7 | Prompt-template registry impl | `TASK-prompt-template-registry.md` | ▲ now | |
| B8 | Memory selection UI + cross-actor hardening test | P2-C L242, P4, hardening L476 | ▲ now | |
| B9 | i18n frontend strings + locale switcher | `backlog.md` L68 | ▲ now | |
| B10 | Fine-tuning UX (provider health, fine-tune UI) | P4 L431 | ▲ now | |
| C1 | Chat-type matrix UI (group chat, GM panels, quest log, story frontend) | P2-B/D, P4 L424 | ▲ now | |
| C2 | NSFW 5-tier character rating runtime enforcement | P4 L425 | ▲ now | |
| C3 | Assistant tooling (tool-call display, creation wizards, `/commands` tiered) | P2-C L232, P4 L428 | ▲ now | |
| C4 | Char/world/loc flows (multi-format import, settings menus, mood meter) | P4 L427 | ▲ now | |
| C5 | LLM providers (Anthropic/Ollama/Bedrock) | P4 L429 | ▲ now | |
| C6 | Assets (signed URLs, compression flow) | P4 L430 | ▲ now | |
| C7 | Group-chat VN party join/leave | `TASK-travel-party-migration.md` (P2-B L196) | ▲ now | |
| D1 | Assistant panel in chat sidebar | P2-B L206 | ▲ now | |
| D2 | Message actions UI (edit/delete/pin/react) | P2-B L207 | ▲ now | |
| D3 | Assistant role selector + expand command buttons | P2-C L228/229 | ▲ now | |
| D4 | Remove dead rule `detectIntent` | P2-C L230 | ▲ now | |
| E1 | Wire GM panels + quest-log + unified GM↔assistant view | P2-D L278-280 | ▲ now | |
| E2 | GM-guided story (user-as-GM UI + doc) | P2-Da L318-322 | ▲ now | |
| F2 | M5 ModerationHook safety | AUX L253 | ▲ now | |
| F1 | 9 AUX LLM enrichment tasks | P2-B L197-204 | ▼ defer | |
| F3 | M6 AUX telemetry | AUX L254 | ▼ defer | |
| G2 | World timeline §5.3/§5.4 convergence | `🟡 Partial` (backlog L57) | ▼ defer | |
| G3 | External music linking | P2-B L190, `backlog.md` L139 (P6+) | ▼ defer | |
| G4 | Authoring/creation ownership indicators | P2-E L351 | ▼ defer | |
| G1 | memorySection cross-actor integration test | hardening L476 | ▲ now | |
| G5 | `open-items.md` create-or-drop | hardening L480 | ▲ now | |
| G6 | Avatar-gallery visibility inheritance | P2-F L372 | ▲ now | |

**No decision needed (stale/dup):** login page htmx (auth views already exist, P2-E L334 — mark done).

---

## Recent Wiring — LLM Text Templates (2026-08-03)

**Feature**: config-driven system prompts for assistant/gm/vn/nsfw/aux (transition, intent, memory) domains, overridable via user `configs/templates/llm.yaml` (gitignored, only `.example.yaml` committed). Resolution: user config `systemPrompts[<purpose>]` → code default `LLM_PROMPT_DEFAULTS` (`src/prompts/registry.ts`).

**Validation**: `bun run check` → **15/17 ✅** (was 15/17 baseline; unit+e2e green, format-dprint green, db-schema gate green). Lint gate re-audit: earlier "201 files" debt was an undercount — true pre-existing debt is **291 files**; all my new/modified files lint-clean (src/prompts/_, gm/decisions/_, game-master). Zero new failures introduced. seedBootstrapAdmin bug fixed (3121→3125 pass).

| Area                                                                                                                                                                                                                               | State              | Where                                                                                                                    | Next / open                                                |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| **Prompts registry** — `LLM_PROMPT_DEFAULTS` (12 keys) + `resolveSystemPrompt()`                                                                                                                                                   | ✅ Shipped + tests | `src/prompts/{registry,vn,index}.ts` + `src/prompts/registry.test.ts` (10 tests)                                         | —                                                          |
| **Assistant wiring** — fallback chain override → systemPromptFallback → actor.system_prompt                                                                                                                                        | ✅ Shipped (HEAD)  | `src/assistant/prompt/sections/system.ts`, `src/db/seed.ts` (+ `templates?.` bugfix), `src/generation/generate-route.ts` | —                                                          |
| **VN wiring** — vn/vnChoices via `resolveSystemPrompt`                                                                                                                                                                             | ✅ Shipped (HEAD)  | `src/routes/vn-generate.ts`                                                                                              | —                                                          |
| **GM wiring** — systemPromptDefault ctor option → decision LLM                                                                                                                                                                     | ✅ Shipped         | `src/story/game-master.ts`, `src/story/gm/decisions/{types,llm}.ts`, `src/generation/auto-gen.ts` (gm+intent)            | —                                                          |
| **AUX wiring** — transition/intent/memory                                                                                                                                                                                          | ✅ Shipped         | `src/chat/transition-classifier.ts`, `src/generation/auto-gen.ts`, `src/memory/extraction.ts`                            | —                                                          |
| **User config** — `configs/templates/llm.example.yaml` documents 12 keys + merge strategies; `.gitignore` `configs/templates/*` (user files ignored, examples tracked)                                                             | ✅ Shipped         | `configs/templates/llm.example.yaml`, `.gitignore`                                                                       | —                                                          |
| **Registry hardening (design)** — typed `PromptPurpose`, single defaults source (registry sole source; `TEMPLATES_DEFAULTS.llm.systemPrompts`→`{}`), dead accessor removal (`sections/llm-templates.ts`), llm.yaml load validation | 📐 Design          | `.plan/design/prompt-template-registry.md`                                                                               | `TASK-prompt-template-registry.md` (impl pending approval) |
| **Open debt** — lint-ts (291 pre-existing files) + size-strict (10 pre-existing files)                                                                                                                                             | ⚠️ pre-existing     | whole repo                                                                                                               | refactor tickets                                           |

---

## Recent Wiring — Chat / Invites / NSFW / Filters (2026-08-03)

**Validation**: `bun run check` → **15/17 ✅** (unit + e2e green; db-schema gate green). md-lint fixed 2026-08-03 (144 → 0); format-dprint fixed (chat.html partial reflow). Remaining failures — both **pre-existing debt**, none from recent changes:
`lint-ts` (`eslint .`) = ~261 errors / 201 files (unicorn/max-nested-calls 89, sonarjs/cognitive-complexity 68, require-await 45, prefer-dom-node-append 36); `credentials.mjs` sonarjs PATH error fixed (scoped eslint-disable). `size-strict` (10 pre-existing >250L files: nsfw/battle/rpg). NOTE: check-parallel.mjs truncates each gate's output to first 10 lines — lint-ts looks like 1 error but is a large pre-existing set.

| Area                                                       | State              | Where                                                                                                                                                 | Next / open                                  |
| ---------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| **Chat invite & join** — invite codes, join flow, e2e      | ✅ Shipped + tests | migration `033_chat_invites`, `src/chat/invites.ts`, `src/routes/invites.ts`, `tests/e2e/flows/invite-join.test.ts`; epic `invitation-system.md`      | —                                            |
| **Chat sections + backgrounds + location explorer**        | ✅ Shipped + tests | migrations `031/032`, `src/routes/chat-sections.ts` + `chat-backgrounds.ts` + `location-explorer.ts`, sections/background-panel.html, world-edit.html | —                                            |
| **Chat-list filters** — type/status/sort                   | ✅ Backend + UI    | `orderChatList` generic + `t.Enum` (bba7d3e8), GET /api/chats filters (327ff22b), `chat-filters.ts` + `chat-list-panel.html` dropdowns                | —                                            |
| **NSFW runtime config store + live enforcement**           | ✅ Shipped         | `src/nsfw/runtime-config.ts`, `admin-nsfw.ts`, mood-shift persistence in `auto-gen.ts` (63c765ce)                                                     | P0 audit-log UI + consent display still open |
| **Emotion avatar generation from mood panel**              | ✅ Shipped         | `mood-panel.html`, `mood.ts`, `user-info.ts` (2794e3d5)                                                                                               | —                                            |
| **Regenerate sibling variant** — swipe_index + idempotency | ✅ Shipped + tests | `src/chat/service.ts`, `src/generation/regenerate-variant.test.ts` (a777b590)                                                                         | —                                            |
| **401-guard normalization** — 18 route files               | ✅ Shipped + P2-E† collapse | 3283d41e (activity, chats, gm-notes, messages, reactions, sessions, vn-choices, …); `requireCtxUser` deleted; Variant A + blog.ts migrated (2026-08-05) | Variants B/C/D/E + middleware deferred (separate-commit per ticket; middleware is separate module family) |
| **Chat setup templates** — seed + admin CRUD + selector UI | ✅ Shipped         | 9619f259 + `new-chat.ts:29-67` (`#chat-template` select, pre-fills mode)                                                                              | —                                            |
| **Group-chat initiative decrement**                        | ✅ Shipped + tests | `src/turning/turn-manager.ts` (30f20b7a)                                                                                                              | —                                            |
| **Context-cut → memory promotion**                         | ✅ Shipped         | 09a451f2 (+ dead modules removed 7de41ec2)                                                                                                            | —                                            |
| **Actor ownership enforcement**                            | ✅ Shipped         | character-io + emotion-avatars routes (f0c39927)                                                                                                      | P2-E authoring indicators                    |

---

## Recent Wiring — Knowledge Systems (2026-08-01)

Shipped this session; reconciled into relevant P3/backlog rows below. Pickup surfaces for
next sessions:

| Area                                                                                                                                                                                                                                        | State                               | Where                                                                                                                                                                                                                                                                                                                | Next / open                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Per-viewer memory injection** — `memorySection` provisions each chat participant against the speaker as viewer (`ownerId` vs `viewerId`), so `evaluateShareability` runs cross-actor (blocked/trusted/shared); combined 1024-token budget | ✅ Implemented + verified           | `src/assistant/prompt/sections/memories.ts`                                                                                                                                                                                                                                                                          | Dedicated memorySection cross-actor integration test (hardening)                                                                                                                                             |
| **Lore audience scoping** — `audience_scope` JSON column; race/profession/location subject taxonomy; `loreSection` gates both actor+world lore through `isLoreVisibleTo` **before** cooldown/constant/selective                             | ✅ Implemented + verified           | migration `028_lore_audience_scope.ts`, `src/assistant/lore/audience.ts`, `src/assistant/prompt/sections/lore.ts`                                                                                                                                                                                                    | — (closed the dark-elves-vs-humans leak)                                                                                                                                                                     |
| **World timeline** — backstory seeding, forward-event steering, cross-story convergence                                                                                                                                                     | 🟡 Partial (backstory seeding done) | `world_timeline_events` table (migration `030_world_timeline_events.ts`); service `src/story/timeline/world-timeline.ts` (`appendTimelineEvents`/`seedBackstory`/`listTimelineEntries`/`getEstablishedHistory`); `applyEvents` hook persists applied events; `seedBackstory` promotes to audience-scoped lore (§5.2) | §5.2 backstory seeding + ledger done; **§5.3 forward-event steering** + **§5.4 cross-story convergence propagation** still greenfield (= cluster B, `IDEA-memory-knowledge-isolation-and-world-timeline.md`) |
| **Event → lore promotion**                                                                                                                                                                                                                  | ✅ Implemented + verified           | `src/story/events/promote-lore.ts`, wired into `applyWorldLoreUpdate` (additive; opt-out `data.promoteToLore===false`), tests `src/story/events/promote-lore.test.ts`, spec `docs/spec/lore.md` §4.1/§6                                                                                                              | "World timeline" above is the next cluster                                                                                                                                                                   |

> Spec: `docs/spec/lore.md` (Draft; audience scoping + per-viewer memory now match implementation).
> Tickets: `IDEA-memory-knowledge-isolation-and-world-timeline.md` (option (b) chosen + implemented, cluster A done).

---

## P0 — Critical Path (Blocking)

| Priority | Epic / Task                                                    | Key Deliverables                                                                                                                                                                  | Status                                                                                                                                  |
| -------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **P0**   | **Data Integrity Phase 1** — Config Guards & Backend Selection | • Reject `sqlite` when `INSTANCE_COUNT > 1`<br>• Warn on network filesystem WAL path<br>• Fix stale MySQL claim in `architecture.md`                                              | ✅ Complete — `src/config/load.ts`, tests passing                                                                                       |
| **P0**   | **NSFW Moderation Safety Infrastructure**                      | • NSFW enable/disable per chat/user/world<br>• Non-public audit log of NSFW gate decisions<br>• Consent state tracking (from Shared Schemas)<br>• Generation boundary integration | 🟡 Partial — runtime config store + live enforcement + mood-shift persistence shipped (2026-08-03); audit-log UI + consent display open |
| **P0**   | **Shared Schemas** — Reputation, Consent, NSFW Rating          | • Unified `ReputationScore` (Social, Faction, NSFW)<br>• Unified `ConsentState` (NSFW + Chat Lifecycle)<br>• `NSFWContentRating` runtime enforcement at generation boundary       | ✅ Complete — `src/schemas/` implemented                                                                                                |

---

## P1 — High Priority (Post-P0)

| Priority | Epic / Task                                                           | Key Deliverables                                                                                                                                                                                                  | Status                                      |
| -------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| **P1**   | **Memory Tiers Wiring** — Selection UI, Lorebook, Cross-Chat          | • Memory selection UI (pinning, mid-chat panel)<br>• Lorebook activation with cooldowns<br>• Cross-chat memory persistence across workspaces<br>• Full generation pipeline integration                            | ✅ Complete                                 |
| **P1**   | **NSFW Integration Gaps** — Housing, Weather, Social, Disease         | • Housing: private spaces → encounter modifiers<br>• Weather: mood/pheromone/location availability<br>• Social: shared reputation, skill prerequisites<br>• Disease: reproductive health, STD transmissions       | ✅ Complete                                 |
| **P1**   | **Battle Integration Gaps** — Items, Social, NPC, Weather, Resolution | • Equipment stats → combat modifiers<br>• Social skills (intimidate/negotiate) in combat<br>• NPC personality-driven AI<br>• Weather/terrain environmental modifiers<br>• Unified dice resolution for all systems | ✅ Complete — `src/battle/` (54KB, 6 files) |
| **P1**   | **Data Integrity Phase 2** — `data_version` Optimistic Concurrency    | • `UPDATE ... WHERE data_version = ?` on high-contention tables<br>• `409 Conflict` on version mismatch<br>• Unit + integration tests                                                                             | ✅ Complete                                 |

> P1 complete as of 2026-07-30. All 4 items done.

---

## P1.5 — Accessibility

> ✅ Complete as of 2026-07-31

---

## P2 — Core Workstream (Next Work)

> **Emphasis**: VN mode, chat, assistant, tool calling, GM flows, authorization, access control, gallery. RPG mechanics deferred to P2-later.
> **New**: GM-guided story creation — user as Game Master, guiding LLM characters in chat/group-chat to build a story together.
> **Knowledge systems (2026-08-01)**: per-viewer memory injection + lore audience scoping shipped — see "Recent Wiring — Knowledge Systems" above; world timeline + event→lore promotion are the greenfield next cluster.

### P2 — Priority Tiers

| Tier      | Topic                                | Ticket(s)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Status                                                                      |
| --------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **P2-A**  | **Visual Novel Mode**                | [`TASK-visual-novel-mode.md`](TASK-visual-novel-mode.md), [`TASK-chat-visual-novel-mode.md`](TASK-chat-visual-novel-mode.md), [`TASK-vn-branching-choices.md`](TASK-vn-branching-choices.md), [`TASK-vn-dynamic-generation.md`](TASK-vn-dynamic-generation.md), [`TASK-vn-qa-mode.md`](TASK-vn-qa-mode.md), [`TASK-vn-scene-template-system.md`](TASK-vn-scene-template-system.md), [`TASK-vn-template-actions.md`](TASK-vn-template-actions.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | 🟡 Foundation done                                                          |
| **P2-G**  | **LoRA Discovery & Application**     | [`TASK-lora-discovery-application.md`](TASK-lora-discovery-application.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | ⬜ Not Started                                                              |
| **P2-B**  | **Chat System**                      | [`TASK-chat-autorenaming.md`](TASK-chat-autorenaming.md), [`TASK-chat-backgrounds-location-sync.md`](TASK-chat-backgrounds-location-sync.md), [`TASK-chat-external-music-linking.md`](TASK-chat-external-music-linking.md), [`TASK-chat-room-search-join.md`](TASK-chat-room-search-join.md), [`TASK-chat-room-filters.md`](TASK-chat-room-filters.md), [`TASK-chat-message-search.md`](TASK-chat-message-search.md), [`TASK-chat-sectioning-multi-location.md`](TASK-chat-sectioning-multi-location.md), [`TASK-chat-transfer-location.md`](TASK-chat-transfer-location.md), [`TASK-travel-party-migration.md`](TASK-travel-party-migration.md), [`TASK-transition-aux-llm-fallback.md`](TASK-transition-aux-llm-fallback.md), [`TASK-aux-mood-classification.md`](TASK-aux-mood-classification.md), [`TASK-aux-memory-extraction.md`](TASK-aux-memory-extraction.md), [`TASK-aux-environment-interaction.md`](TASK-aux-environment-interaction.md), [`TASK-aux-personality-drift.md`](TASK-aux-personality-drift.md), [`TASK-aux-gm-tool-detection.md`](TASK-aux-gm-tool-detection.md), [`TASK-aux-scene-context.md`](TASK-aux-scene-context.md), [`TASK-aux-emotion-avatar.md`](TASK-aux-emotion-avatar.md), [`e2e-invite-join-test.md`](e2e-invite-join-test.md), [`invite-code-generation.md`](invite-code-generation.md), [`join-flow-mechanics.md`](join-flow-mechanics.md), [`epic-invitation-system.md`](epic-invitation-system.md) | 🟡 In Progress (invites, sections, backgrounds, filters shipped 2026-08-03) |
| **P2-C**  | **Assistant & Tool Calling**         | [`TASK-assistant-commands-extension.md`](TASK-assistant-commands-extension.md), [`TASK-assistant-command-execution-intent-detection.md`](TASK-assistant-command-execution-intent-detection.md), [`TASK-assistant-gm-flows.md`](TASK-assistant-gm-flows.md), [`TASK-assistant-gm-flows-reconciliation.md`](TASK-assistant-gm-flows-reconciliation.md), [`TASK-wire-gm-service-story-mode.md`](TASK-wire-gm-service-story-mode.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | 🟡 Command buttons expanded                                                 |
| **P2-D**  | **GM Flows**                         | [`TASK-assistant-gm-flows.md`](TASK-assistant-gm-flows.md), [`TASK-gm-shadow-notes.md`](TASK-gm-shadow-notes.md), [`TASK-gm-whitenotes.md`](TASK-gm-whitenotes.md), [`TASK-assistant-gm-flows-reconciliation.md`](TASK-assistant-gm-flows-reconciliation.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | 🟡 Frontend done, backend pending                                           |
| **P2-Da** | **GM-Guided Story Creation** _(NEW)_ | [TASK-gm-guided-story-creation.md](TASK-gm-guided-story-creation.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | ⬜ Not Started                                                              |
| **P2-E**  | **Authorization & Access**           | [`TASK-auth-register-route.md`](TASK-auth-register-route.md), [`TASK-two-factor-multi-factor-auth.md`](TASK-two-factor-multi-factor-auth.md), [`TASK-encryption-access-management.md`](TASK-encryption-access-management.md), [`TASK-dedupe-message-access-checks.md`](TASK-dedupe-message-access-checks.md), [`TASK-fix-message-reactions-access.md`](TASK-fix-message-reactions-access.md), [`TASK-authoring-creation.md`](TASK-authoring-creation.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | ⬜ Not Started                                                              |
| **P2-F**  | **Gallery**                          | [`TASK-gallery-minimal-image-asset-viewer.md`](TASK-gallery-minimal-image-asset-viewer.md), [`TASK-config-gallery-attachment-idempotent.md`](TASK-config-gallery-attachment-idempotent.md), [`TASK-character-avatar-gallery-binding.md`](TASK-character-avatar-gallery-binding.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | 🟡 In Progress (avatar binding backend done)                                |

---

### P2-A — Visual Novel Mode

**Epic**: `epic-visual-novel-mode.md` — Backend `src/story/` exists (6 story route files); **frontend foundation complete** (2026-07-31).

#### Frontend Status

| Component           | Status  | File                                                 |
| ------------------- | ------- | ---------------------------------------------------- |
| Scene renderer      | ✅ Done | `src/frontend/vn/scene-renderer.ts`                  |
| Portrait manager    | ✅ Done | `src/frontend/vn/portrait-manager.ts`                |
| Transition engine   | ✅ Done | `src/frontend/vn/transition-engine.ts`               |
| Typewriter          | ✅ Done | `src/frontend/vn/typewriter.ts`                      |
| Settings            | ✅ Done | `src/frontend/vn/settings.ts`                        |
| CSS                 | ✅ Done | `src/frontend/vn/styles.css` + appended to `app.css` |
| GmConfig extension  | ✅ Done | `chat-types.ts` (12 VN fields)                       |
| Chat settings UI    | ✅ Done | `chat-settings-modal.html`                           |
| Chat.html wiring    | ✅ Done | Conditional VN vs bubble layout                      |
| Choice cards        | ✅ Done | `src/frontend/vn/choice-cards.ts`                    |
| QA mode             | ✅ Done | `src/frontend/vn/qa-mode.ts`                         |
| Template engine     | ✅ Done | `src/frontend/vn/templates/template-engine.ts`       |
| Scene templates     | ✅ Done | `src/frontend/vn/templates/scene-templates.ts`       |
| Dialogue templates  | ✅ Done | `src/frontend/vn/templates/scene-templates.ts`       |
| Transition triggers | ✅ Done | `src/frontend/vn/templates/transition-triggers.ts`   |
| Story generation    | ✅ Done | `src/routes/vn-generate.ts`                          |
| Choice generation   | ✅ Done | `src/routes/vn-generate.ts`                          |
| Image preloading    | ✅ Done | `src/frontend/vn/image-preloader.ts`                 |

- [x] Wire `src/frontend/vn/` scene renderer with image overlay + CSS transitions
- [x] Add typewriter animation component (`src/frontend/vn/typewriter.ts`)
- [x] Implement transition engine (fade/cut/dissolve/slide/wipe)
- [x] Implement portrait manager (left/right/center positioning)
- [x] Add VN settings UI to chat-settings-modal.html
- [x] Wire VN settings load/save in chat-settings.ts
- [x] Wire VN mode into `chat.html` (conditional VN vs bubble layout)
- [x] Implement branching choices system (`TASK-vn-branching-choices.md`)
- [x] Build QA mode for VN content validation (`TASK-vn-qa-mode.md`)
- [x] Create scene template system (`TASK-vn-scene-template-system.md`)
- [x] Implement pre-configured templates (`TASK-vn-template-actions.md`)
- [x] Implement story & choice generation (`TASK-vn-dynamic-generation.md`)
- [x] Implement image preloading (`src/frontend/vn/image-preloader.ts`)
- [ ] **Verification**: `bun run check && bun test src/story/`

---

### P2-B — Chat System

#### Frontend Gap Tasks (file-level evidence)

| Gap                               | Evidence File                                                                                                                                                                                                                   | What to Build                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Chat types exist                  | `src/frontend/alpine/chat-types.ts` — `ChatState`, `GmConfig`, `Message`, `MessageAttachment`, `GroupedMessage`, `RpgStats`, `MemoryPanelState` (571 lines)                                                                     | Extend `ChatState` with chat UI state for new features                                       |
| Command buttons (tool calling UI) | `src/frontend/alpine/command-buttons.ts` — exists (27 buttons: image, video, sfx, music, caption, improve, quest, roll) — inserts slash text into input; **parser + dispatch wired server-side** (`src/routes/messages.ts:543`) | Wire remaining commands; add tool-call result display                                        |
| GM role switching exists          | `src/frontend/alpine/chat-settings.ts` — `_assistantRole: "off"`, `chat?.gm_config` parsed with `GmConfig` type (line 33-36)                                                                                                    | Build GM role switching UI (dropdown: off/helper/gm/moderator)                               |
| Auth basics exist                 | `src/frontend/fe-fetch.ts` — CSRF + session token injection, 401 redirect to login                                                                                                                                              | Build login/register pages that use `feFetch`                                                |
| Admin user mgmt exists            | `src/frontend/alpine/admin-users.ts` — role editing, user list, pagination, search, filter                                                                                                                                      | Extend with access control panels                                                            |
| Gallery page exists               | `src/frontend/pages/gallery.ts` — search, preview, download, delete, type filtering (image/audio/video)                                                                                                                         | ✅ Backend wired via `assetRoutes` + `viewRoutes` in `elysia-app.ts`                         |
| Chat room management              | `docs/frontend/chat/overview.md`                                                                                                                                                                                                | Room list, create/rename/delete room components                                              |
| Chat autorenaming                 | `TASK-chat-autorenaming.md`                                                                                                                                                                                                     | Auto-label chat sessions based on first exchange                                             |
| Chat backgrounds + location sync  | `TASK-chat-backgrounds-location-sync.md`                                                                                                                                                                                        | Background image picker; location indicator in chat header — ✅ done (2026-08-03)            |
| External music linking            | `TASK-chat-external-music-linking.md`                                                                                                                                                                                           | Music embed component (browser-native `<audio>` or iframe)                                   |
| Room search & join                | `TASK-chat-room-search-join.md`, `docs/frontend/chat/search-and-filter.md`                                                                                                                                                      | Searchable room list, join via htmx — ✅ done (2026-08-03, invite + join system)             |
| Room filters                      | `TASK-chat-room-filters.md`                                                                                                                                                                                                     | Filter rooms by world, character, date — ✅ backend (2026-08-03); frontend filter UI pending |
| Message search & filter           | `TASK-chat-message-search.md`, `docs/frontend/chat/search-and-filter.md`                                                                                                                                                        | In-chat message search with highlight                                                        |
| Multi-location sectioning         | `TASK-chat-sectioning-multi-location.md`                                                                                                                                                                                        | Location tabs/segments in chat view — ✅ done (2026-08-03)                                   |
| Chat transfer + location change   | `TASK-chat-transfer-location.md`, `FEAT-chat-transfer-location-change.md`                                                                                                                                                       | Transfer chat between characters/worlds UI                                                   |
| Group chat UI                     | `docs/frontend/chat/group-chat.md` (194 lines, partially implemented)                                                                                                                                                           | Multi-participant chat view, participant list, side-chat creation                            |
| Assistant panel                   | `docs/frontend/chat/assistant.md` (147 lines, designed but not implemented)                                                                                                                                                     | Assistant context panel in chat sidebar                                                      |
| Message actions                   | `docs/frontend/chat/message-actions.md`                                                                                                                                                                                         | Edit, delete, pin, react to messages in UI                                                   |

- [x] Wire command buttons (`src/frontend/alpine/command-buttons.ts`) into slash command parser (`TASK-assistant-commands-extension.md`) — parser + dispatch in `messages.ts:543`, 21 handlers (2026-08-01)
- [x] Build GM role switching UI from existing `_assistantRole` field in `chat-settings.ts` — dropdown state loads/saves; **runtime effect pending** (role stored, never branched)
- [ ] Build registration form frontend page (`docs/frontend/login.md`, 41 lines) using `feFetch` (`src/frontend/fe-fetch.ts`)
- [ ] Build login page with htmx submission using `feFetch` auth flow
- [x] Implement chat autorenaming (`TASK-chat-autorenaming.md`) — `src/chat/auto-rename.ts` (rule + LLM), wired in `src/routes/messages.ts`, `name_source` migration, test file
- [x] Implement chat backgrounds + location sync (`TASK-chat-backgrounds-location-sync.md`) — `src/routes/chat-backgrounds.ts` + `src/frontend/alpine/chat-backgrounds.ts` + background-panel.html (2026-08-03)
- [ ] Implement external music linking (`TASK-chat-external-music-linking.md`)
- [x] Wire chat room search & join (`TASK-chat-room-search-join.md`) — joinable-chat discovery + join UI (d04ed2cf) + full invite & join system (6dda6485: migration 033, `src/chat/invites.ts`, `src/routes/invites.ts`, e2e)
- [x] Implement chat room filters backend + UI (`TASK-chat-room-filters.md`) — GET /api/chats type/status/sort via generic `orderChatList` + `t.Enum` (2026-08-03); frontend dropdowns `chat-filters.ts` + `chat-list-panel.html` (2026-08-05)
- [ ] Implement chat message search & filter (`TASK-chat-message-search.md`)
- [x] Implement multi-location chat sectioning (`TASK-chat-sectioning-multi-location.md`) — migrations 031/032, `src/routes/chat-sections.ts`, sections-panel.html, location-explorer (2026-08-03)
- [ ] Implement chat transfer + location change (`TASK-chat-transfer-location.md`)
- [ ] Implement party join/leave with VN narration (`TASK-travel-party-migration.md`)
- [ ] Implement AUX LLM transition fallback (`TASK-transition-aux-llm-fallback.md`)
- [ ] Implement AUX LLM mood classification (`TASK-aux-mood-classification.md`)
- [ ] Implement AUX LLM memory extraction (`TASK-aux-memory-extraction.md`)
- [ ] Implement AUX LLM environment interaction (`TASK-aux-environment-interaction.md`)
- [ ] Implement AUX LLM personality drift check (`TASK-aux-personality-drift.md`)
- [ ] Implement AUX LLM GM tool detection (`TASK-aux-gm-tool-detection.md`)
- [ ] Implement AUX LLM scene context extraction (`TASK-aux-scene-context.md`)
- [ ] Implement AUX LLM emotion avatar selection (`TASK-aux-emotion-avatar.md`)
- [ ] Wire group chat UI (`docs/frontend/chat/group-chat.md`)
- [ ] Wire assistant panel into chat sidebar (`docs/frontend/chat/assistant.md`)
- [ ] Wire message actions UI — edit, delete, pin, react (`docs/frontend/chat/message-actions.md`)
- [ ] **Verification**: `bun run check && bun test src/routes/`

---

### P2-C — Assistant & Tool Calling

#### Frontend Gap Tasks (file-level evidence)

| Gap                           | Evidence File                                                                                                             | What to Build                                                                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Assistant role types exist    | `src/frontend/alpine/chat-types.ts` line 125-129: `GmConfig` with `assistantRole?: "off"                                  | "helper"                                                                                                                                       |
| `_assistantRole` field exists | `src/frontend/alpine/chat-settings.ts` line 15: `_assistantRole: "off"` — stored but not exposed in UI                    | Expose role dropdown in chat settings panel                                                                                                    |
| Command buttons exist         | `src/frontend/alpine/command-buttons.ts` — 8 functional buttons (image, video, sfx, music, caption, improve, quest, roll) | Expand command palette; add text generation commands (summarize, rewrite, translate)                                                           |
| Chat settings page exists     | `src/frontend/alpine/chat-settings.ts` — chat settings modal with mode, turn strategy, streaming, persona, impersonation  | Add assistant role + GM config to settings modal                                                                                               |
| Tool calling display          | —                                                                                                                         | Show function calls, parameters, and LLM tool results in chat bubbles                                                                          |
| GM service wiring             | `TASK-wire-gm-service-story-mode.md`                                                                                      | ✅ Wired — story-mode chats use `GameMasterService` (`auto-gen.ts:184,792`); remaining: UI authoring of `GameMasterConfig.type` (human/hybrid) |
| Assistant ↔ GM reconciliation | `TASK-assistant-gm-flows-reconciliation.md`                                                                               | Unified assistant/GM interface in chat UI                                                                                                      |

- [x] Expose GM role switching (`"off" | "helper" | "gm" | "moderator"`) in chat settings UI (uses existing `_assistantRole` + `GmConfig` from `chat-types.ts`) — 2026-08-01
- [x] **Give GM role switching runtime effect** (branch generation/prompt on `assistantRole`) — `auto-gen.ts:201-213` (`"gm"` → `resolveSystemPrompt(llm,"gm")`) + `auto-gen-gm-role.test.ts`; **working tree, uncommitted** (2026-08-05)
- [ ] Expand command buttons (`src/frontend/alpine/command-buttons.ts`) with text generation commands for assistant
- [ ] Add assistant role selector to chat settings modal (`chat-settings.ts`)
- [ ] Implement assistant command execution with intent detection (`TASK-assistant-command-execution-intent-detection.md`) — parser ✅; LLM `classifyIntent` wired (`auto-gen.ts:311` short-reply, 2026-08-05); rule `detectIntent` still dead code, remove in unwired-code close-out
- [x] Wire slash commands (`/`) into assistant pipeline (`TASK-assistant-commands-extension.md`) — 2026-08-01
- [ ] Implement assistant tool calling display (function-call UI in chat — show tool call + params + result in message bubbles)
- [x] Integrate GM service into assistant flow (`TASK-wire-gm-service-story-mode.md`) — 2026-08-01
- [ ] Reconcile assistant ↔ GM flow interfaces (`TASK-assistant-gm-flows-reconciliation.md`)
- [ ] **Verification**: `bun run check && bun test src/assistant/`

#### Knowledge Systems (this session)

- [x] Lore audience scoping — migration `028_lore_audience_scope`, resolver `src/assistant/lore/audience.ts`, `loreSection` identity + pre-filter; spec `docs/spec/lore.md` reconciled
- [x] Per-viewer memory injection — `memorySection` provisions each participant against speaker as viewer; combined 1024-token budget, per-actor cap
- [x] Chat-setup-templates (`IDEA-chat-setup-templates.md`) — seed + admin CRUD shipped (9619f259) + `new-chat.html` selector (`new-chat.ts` fetches `/api/chat-setup-templates`) — 2026-08-05
- [ ] Hardening: dedicated `memorySection` cross-actor integration test

#### AUX LLM Wiring Fixes (2026-08-01 review → epic-aux-enrichment-pipeline M1-M6)

Review of AUX LLM wirings (intent detection, moderation, emotion avatar) found
latency + BYO-key + dead-role gaps. Actionable queue:

- [x] **M1 — Shared AUX runner** `src/aux-pipeline/runner.ts`: one policy (2s timeout, temp 0.0, maxTokens 100, apiKey via `resolveProvider`); transition-classifier + memory extraction + LLM `classifyIntent` (`auto-gen.ts:311`) all route through `callAux` — already shipped; no action needed (verified 2026-08-05)
- [x] **M2 — Fix memory extraction**: real model instead of literal `"default"` (`as never` cast), drop dead `modelId`/dup `db` params (`src/memory/extraction.ts`) — already shipped; no action needed (verified 2026-08-05)
- [x] **M3 — Dead model roles**: `ModelRole.Captioning` wired into `/caption` via `resolveModelRole` + `resolveProvider` BYO (caption-route, commit `8f8c0abb`, precedence `150ce79b`); `ModelRole.Moderation` removed from `VALID_ROLES` + config + dead `ModelRoleSchema` (kept in DB enum)
- [x] **M4 — Consume emotion/mood hook events**: `emotion_change` → `dominantEmotion` stored on `messages.emotion` (`auto-gen.ts:449-451,516`) → frontend `avatarForMessage` binds it to an emotion avatar (`mood.ts:250-258`); `mood_shift` → `delta` applied via `MoodService.applyHappinessDelta` → `character_mood` write (`auto-gen.ts:526-539`). Story/GM path mirrors emotion extraction (`auto-gen.ts:926-953`). Happy-path test added `auto-gen-emotion-avatar.test.ts` (emotion binding + mood persistence + no-hook null). Verified 2026-08-05.
- [ ] **M5 — ModerationHook safety**: word-boundary matching, severity, `recordAudit`, non-destructive suppression
- [ ] **M6 — AUX telemetry**: record tokens/latency per AUX call
- [ ] **Verification**: `bun run check && bun test src/chat/ src/memory/ src/generation/hooks/`

---

### P2-D — GM Flows

#### Frontend Status

| Component                   | Status     | File                                                      |
| --------------------------- | ---------- | --------------------------------------------------------- |
| GM panel sidebar            | ✅ Done    | `src/components/chat/gm-panel.html`                       |
| Shadow notes UI             | ✅ Done    | `src/frontend/alpine/gm-panel.ts`                         |
| Whitenotes UI               | ✅ Done    | `src/frontend/alpine/gm-panel.ts`                         |
| GmConfig GM fields          | ✅ Done    | `chat-types.ts` (gmTurnOrder, questEnabled)               |
| Shadow notes API routes     | ✅ Done    | `src/routes/gm-notes.ts` — CRUD, wired in `elysia-app.ts` |
| Whitenotes API routes       | ✅ Done    | `src/routes/gm-notes.ts` — CRUD, wired in `elysia-app.ts` |
| GM role switching UI wiring | ❌ Pending | —                                                         |

- [x] Extend `GmConfig` type in `chat-types.ts` with story-mode fields (gm_role, turn_order, quest_enabled)
- [x] Implement GM shadow notes frontend panel (`TASK-gm-shadow-notes.md`)
- [x] Implement GM whitenotes frontend panel (`TASK-gm-whitenotes.md`)
- [x] Implement GM shadow notes API routes + DB table (`src/routes/gm-notes.ts`)
- [x] Implement GM whitenotes API routes + DB table (`src/routes/gm-notes.ts`)
- [ ] Wire GM panels into chat UI (story mode frontend) — `docs/frontend/chat/multi-llm-story.md` (521 lines, spec complete)
- [ ] Wire GM ↔ assistant unified view in chat (`TASK-assistant-gm-flows-reconciliation.md`)
- [ ] Build quest log UI component (links to `src/story/` quest engine)
- [ ] **Verification**: `bun run check`

---

### P2-Da — GM-Guided Story Creation _(NEW)_

**Ticket**: [`TASK-gm-guided-story-creation.md`](TASK-gm-guided-story-creation.md)

> The user acts as Game Master, guiding LLM characters in chat or group-chat to collaboratively generate a story. This extends the existing GM flows (P2-D) with a specific UX: the user has direct control over narrative direction while LLMs handle character voices and scene details.

#### Why This Is a Natural Extension

The existing infrastructure already supports this pattern:

- **Group chat** (`docs/frontend/chat/group-chat.md`, 194 lines) supports multiple participants. Adding a "user-GM" participant type is an extension, not a new pattern.
- **GM role** (`GmConfig.assistantRole = "gm"`) already exists in `src/frontend/alpine/chat-types.ts` line 125-129. The `moderator` variant handles enforcement; the `gm` variant needs narrative guidance UX.
- **Story mode** (`src/story/`, 6 backend files) has turn orchestration. The GM-guided variant makes the user the turn orchestrator instead of the system.
- **Assistant as GM** (`docs/frontend/chat/assistant.md`) describes the GM role as "orchestrates the session: turn order, response evaluation." The user-GM variant gives that power to the human.

#### Design

| Concept                     | Implementation                                                       | File                                                                              |
| --------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| User as GM participant      | New chat participant type `"gm"` in group chat                       | `src/frontend/alpine/chat-types.ts` (extend GroupChatParticipant type)            |
| GM guidance commands        | `/guide` slash command to give narrative direction to characters     | `src/frontend/alpine/command-buttons.ts` (add guide button)                       |
| Character response steering | GM can prompt specific characters or set narrative constraints       | `src/frontend/alpine/chat-settings.ts` (GM guidance panel)                        |
| Story arc tracking          | Lightweight story arc list visible in GM panel                       | `docs/frontend/chat/multi-llm-story.md` (use existing quest/state infrastructure) |
| Group chat + GM integration | GM controls turn order in group chat; characters respond in sequence | `docs/frontend/chat/group-chat.md` (22)                                           |

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

#### Verified State (2026-08-01)

| Component              | Status                                                                                                                       | Evidence                                                                      |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Auth routes (backend)  | ✅ Done                                                                                                                      | `src/routes/auth.ts` — login, register, demo-login, logout, /me endpoints     |
| Auth views (frontend)  | ✅ Done                                                                                                                      | `src/views/login.html`, `src/views/register.html` — wired in `elysia-app.ts`  |
| feFetch (CSRF + 401)   | ✅ Done                                                                                                                      | `src/frontend/fe-fetch.ts` — redirects to `/views/login` on 401               |
| Admin user mgmt        | ✅ Done                                                                                                                      | `src/frontend/alpine/admin-users.ts` — role editing, user list, search/filter |
| Admin routes           | ✅ Done                                                                                                                      | `src/routes/admin.ts` — users, stats, providers, model-roles                  |
| Encryption (browser)   | ✅ Done                                                                                                                      | `src/frontend/browser-crypto.ts` — AES-256-GCM                                |
| MFA / Two-Factor       | ▼ Deferred (2026-08-05) — local-only auth, no external integrations; draft/noop acceptable; moved to P6+ | No TOTP/MFA code found                                                        |
| Message access checks  | ✅ Shipped (2026-08-05) — access gated via `checkChatAccess`; POST reaction toggle now checked | `TASK-dedupe-message-access-checks.md`                                        |
| Encryption status UI   | ✅ Done (2026-08-06) — per-chat key load (`chat-keys.ts` + `/api/chats/:id/encryption-key`) + key-mgmt settings tab (`key-management.ts`) + **chat-list 🔒 badge** (server-rendered from `chats.encryption_level`, `views.ts`); time-based-expiry access mgmt is separate blocked feature | `TASK-encryption-access-management.md`                                        |
| Reaction access gating | ✅ Shipped (2026-08-05) — owner/participant/role via `checkChatAccess`; `message-reactions.test.ts` | `TASK-fix-message-reactions-access.md`                                        |
| Authoring ownership    | 🟡 Partial — actor ownership enforced on character-io + emotion-avatars routes (f0c39927); broader authoring indicators open | `TASK-authoring-creation.md`                                                  |

#### Remaining Work

- [x] ~~Implement two-factor/MFA auth with setup UI~~ — **Deferred 2026-08-05** to P6+ (local server, local registrations, no external integrations — no auth overcomplication; draft/noop acceptable). `TASK-two-factor-multi-factor-auth.md`
- [x] Implement message-level access check UI (`TASK-dedupe-message-access-checks.md`) — **shipped 2026-08-05** (access gated via `checkChatAccess`; no dup helpers in `messages.ts`/`message-reactions.ts`)
- [x] Encryption + access-mgmt display — **value #4 already wired 2026-08-06** (messages + assets compress-encrypt; per-chat key + key-mgmt UI) + **chat-list 🔒 badge shipped 2026-08-06** (rendered from `chats.encryption_level` in `views.ts`; tested via `/dynamic/chats/list`). Remaining time-based-expiry access mgmt is a **blocked P6+ feature** (`TASK-encryption-access-management.md`), separate from value #4.
- [x] Fix message reactions access check in UI (`TASK-fix-message-reactions-access.md`) — **shipped 2026-08-05** (POST toggle now gated; `message-reactions.test.ts`, 8 tests)
- [ ] Implement authoring/creation ownership indicators (`TASK-authoring-creation.md`)
- [ ] **Verification**: `bun run check && bun test src/routes/auth.test.ts`

---

### P2-F — Gallery

#### Verified State (2026-08-01)

| Component              | Status  | Evidence                                                                                    |
| ---------------------- | ------- | ------------------------------------------------------------------------------------------- |
| Gallery page           | ✅ Done | `src/frontend/pages/gallery.ts` — search, filter, preview, actions (82 lines)               |
| Gallery grid (HTMX)    | ✅ Done | `src/routes/views.ts` — `serveGalleryGrid` + `serveGallerySearch`                           |
| Preview modal          | ✅ Done | `src/partials/gallery/preview-modal.html` — copy URL, download, delete                      |
| Upload dialog          | ✅ Done | `src/partials/gallery/upload-modal.html` — HTMX, drag-drop, label input                     |
| Gallery CSS            | ✅ Done | `src/public/css/gallery.css` — design tokens, responsive grid                               |
| Asset controller       | ✅ Done | `src/assets/controller.ts` — upload, serve, download, delete                                |
| Asset service          | ✅ Done | `src/assets/service.ts` — CRUD, visibility, sharing, access checks                          |
| Avatar gallery binding | ✅ Done | Backend + entity filter + tab done; visibility inheritance pending                          |
| Idempotent upload      | ✅ Done | SHA-256 hash-based duplicate detection in `createAsset`                                     |
| Gallery in story view  | ✅ Done | Attachments panel in VN scene renderer (`src/frontend/vn/scene-renderer.ts` + `styles.css`) |

#### Remaining Work

- [x] Make gallery upload idempotent — hash-based duplicate detection (`TASK-config-gallery-attachment-idempotent.md`)
- [x] Wire gallery into story view — attachments panel renders message-linked assets in each VN scene
- [ ] **Verification**: `bun run check`

---

### P2-later — RPG Mechanics (deferred from earlier plan)

Tickets: `TASK-rpg-mechanics-dice-stats.md`, `TASK-rpg-mechanics-combat.md`, `TASK-rpg-mechanics-xp-loot.md`

Deferred until P2-A through P2-F (including the new GM-guided story creation task) are in progress or complete.

---

## P3 — Core Foundation (0.1.0 value-aligned)

> **Alignment (2026-08-05)**: P3→P5 follow the **0.1.0 highest-value features** — user-centric core (identity, access, encryption, all chat types, NSFW, image captioning, i18n, VN, gallery, panels/settings, LLM support, assistant tooling, IO, notifications, filtering/search, memory+template injection). Everything else → **P6+** unless it blocks P3–P5. Full per-item map lives in `backlog.md` `## P3`.

| #  | Value feature                                                                                      | Status                     | Where / next                                                                                      |
| -- | -------------------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------- |
| 1  | **User registration**                                                                              | 🟡 partial                 | `POST /api/auth/register` route ✅ (`src/routes/auth.ts`); register frontend page pending         |
| 2  | **User authentication**                                                                            | 🟡 partial                 | login/logout/demo-login/`/me` ✅; `/api/sessions` pending (P2-E); **MFA (TOTP) deferred to P6+** (2026-08-05) |
| 3  | **Correct access** (chats, assets, worlds, locations)                                              | 🟢 core / 🟡 gaps          | actor ownership (f0c39927); 401 guards unified (P2-E†, 2026-08-05); message/reaction access checks done; **world/location access checks SKIPPED 2026-08-06** (merge-risk w/ `tree/` worktree — revisit later) |
| 4  | **Encryption + compression flow**                                                                  | ✅ Implemented + wired    | browser AES-256-GCM (`browser-crypto.ts`) ✅; `pipeline.ts` wired into messages (encrypt/decrypt + client pre-encrypt) + asset storage (`encryptAssetBlob`/`decryptAssetBlob`); key mgmt UI + `/api/chats/:id/encryption-key` ✅ (2026-08-06 audit) |
| 5  | **Chats — all 9 types**                                                                            | 🟡 P2-B in progress        | autorenaming ✅, sections ✅, invites ✅, filters ✅; message search/transfer pending             |
| 6  | **NSFW features, prompting, opt-in, sfw/nsfw caps**                                                | 🟢 core / 🟡 UI            | runtime config + live enforcement ✅; audit-log UI + consent display + character rating open      |
| 7  | **Metadata extraction + captioning**                                                               | 🟢 done                    | regex pipeline ✅; caption-route wired `8f8c0abb`                                                 |
| 8  | **i18n**                                                                                           | 🟢 server ✅ / 🟡 UI       | `ctx.t` + 11 locales ✅; frontend strings + locale switcher pending                               |
| 9  | **Visual novel mode**                                                                              | ✅ Complete (2026-07-31)   | `src/frontend/vn/` + `src/story/`; gallery-in-scene inheritance open                              |
| 10 | **Gallery + (image) asset preview**                                                                | 🟢 backend+frontend ✅     | `src/frontend/pages/gallery.ts`, `assetRoutes`; preview across asset types open                   |
| 11 | **User + admin panels, settings, fine-tuning**                                                     | 🟡 partial                 | admin user mgmt ✅; fine-tuning UI / provider health panel pending                                |
| 12 | **(Side panels) without leaving chat**                                                             | 🟡 partial                 | chat-settings modal ✅; in-chat asset preview + linkage panel pending                             |
| 13 | **Chat settings menus** — templates, overall tuning, detailed tuning                               | 🟡 partial                 | setup-template selector ✅ (2026-08-05); detailed tuning frontend open                            |
| 14 | **Character/world/location flows** — creation, export/import, settings, fine-tuning                | 🟡 partial                 | character-io ✅; world/location creation + export/import menus pending                            |
| 15 | **LLM support** — chat, captioning, intent detection, (future) embeddings                          | 🟢 chat/caption/intent     | providers ✅; `classifyIntent` wired (2026-08-05); embeddings greenfield                          |
| 16 | **Assistant tooling for creative support** (character/world/location/items/images/assets creation) | 🟡 partial                 | command buttons + parser ✅; tool-call UI + creation wizards pending                              |
| 17 | **Implemented → must be wired**                                                                    | 🟡 ongoing                 | LoRA routes, dead `detectIntent`, swipe-variant placeholder (see backlog "Unwired Code")          |
| 18 | **Frontend fully wired** — menus, modals, side menus, documentation linkage                        | 🟡 ongoing                 | frontend gap tables in P2-B/C/D/E below                                                           |
| —  | **IO: import/export** — characters, worlds, locations, stories                                     | 🟡 partial                 | JSON character import ✅; PNG/YAML/TOML/CHARX + world/location/story export pending               |
| —  | **Stop generation** for chat/VN                                                                    | 🟡 pending                 | abort/cancel LLM stream UI in chat + VN renderer                                                  |
| —  | **Notifications + notification center**                                                            | 🟡 basic toasts ✅         | cross-chat SSE + unread badge ✅; center UI + noise filtering pending                             |
| —  | **Filtering & search tools** — chats, gallery, worlds, locations                                   | 🟡 partial                 | chat room filters ✅ (2026-08-05); chat message search + world/location search pending            |
| —  | **Memory injection** (high priority, key for chats)                                                | 🟢 per-viewer injection ✅ | `memorySection` per-viewer 1024-token budget (2026-08-01); cross-actor hardening test open        |
| —  | **Template injection** (high priority, key for chats)                                              | 🟢 shipped                 | `LLM_PROMPT_DEFAULTS` + `resolveSystemPrompt` (2026-08-03); prompt-template registry impl pending |

### P4 — Core Experience (0.1.0 value-aligned)

> Not-yet-done value workstreams. See `backlog.md` `## P4` for the full table.

- [ ] Chats: group chat UI, GM panels + quest log, story-mode frontend, chat message search, chat transfer/location change
- [ ] NSFW: audit-log UI + consent display; character NSFW content rating (5-tier) runtime enforcement
- [ ] Memory + template injection UX: memory selection UI (mid-chat, pinning), cross-actor hardening; prompt-template registry impl
- [ ] Character/world/location flows: multi-format import (PNG/YAML/TOML/CHARX), creation + settings menus, mood & happiness meter
- [ ] Assistant tooling: tool-call display, creation wizards, `/commands` tiered access
- [ ] LLM providers: Anthropic/Ollama/Bedrock (embeddings foundation)
- [ ] Assets: signed URLs; asset storage compression flow
- [ ] Fine-tuning experience: provider health panel; fine-tuning UI for chat/persona/character
- [ ] **Verification**: `bun run check && bun test src/routes/ src/assistant/`

### P5 — Wiring, Search & Polish (0.1.0 value-aligned)

> Implemented-but-unwired must ship UI before 0.1.0. See `backlog.md` `## P5`.

- [ ] IO: story + world/location export; import flow for characters/worlds/locations/stories
- [ ] Stop generation: abort/cancel LLM stream UI in chat + VN renderer; idempotent partial-message handling
- [ ] Notification center UI + noise filtering
- [ ] Filtering & search: chat message search w/ highlight, world/location search + filters, gallery search polish, combined filters
- [ ] Frontend wiring: all menus, modals, side menus, documentation linkage; register page; in-chat asset preview + linkage side panel; assistant panel; message actions UI
- [ ] Implemented → wired: LoRA routes, dead `detectIntent`, swipe-variant placeholder, GM role runtime effect
- [ ] **Verification**: `bun run check`

### P6+ — Deferred (not 0.1.0-critical; revisit post-release unless blocking P3–P5)

> Plugin ecosystem, three-tier memory, artifact, ComfyUI, provider ecosystem, RAG, communications, social hub, decentralization, sandboxing, API governance/library, impersonation, 3D view modes, text effects, character-system extensions, model comparison reactions. Full table in `backlog.md` `## P6+`.

## Post-P3 — Road to Happy 0.1.0 (2026-08-05)

`package.json` already declares `version: 0.1.0`; `.plan/implementation-plan.md` release row "Tag v0.1.0" is ❌. "Happy 0.1.0" = Gate C **and** the release-hardening below all green, then a signed tag + release notes. This is the completion queue after P2/P3 feature work.

### 0.1.0 scope = highest-value features

P3→P5 are aligned to the **0.1.0 highest-value feature list** (see `backlog.md` `## P3` and `immediate.md` `## P3`): user registration/auth, correct access (chats/assets/worlds/locations), encryption+compression flow, all 9 chat types, NSFW features/prompting/opt-in/sfw-nsfw caps, metadata extraction+captioning, i18n, VN mode, gallery+asset preview, user/admin panels+settings+fine-tuning, in-chat side panels, chat settings menus, character/world/location flows, LLM support (chat/captioning/intent/embeddings), assistant creative tooling, IO (import/export), stop-generation, notifications center, filtering/search, and **memory + template injection (high priority — key for chats)**. Non-value work sits in **P6+** unless it blocks P3–P5.

### Definition of "happy"

- **Gate C passed** — VN mode, chat, assistant+tool calling, GM flows, GM-guided story, auth/access, gallery usable (P2 priority tiers above)
- **Gate D passed** — P3–P5 0.1.0 value tiers operational (Core Foundation → Core Experience → Wiring/Search/Polish); P6+ deferred items (plugin ecosystem, three-tier memory, artifact, ComfyUI, provider ecosystem) non-blocking
- **`bun run check` 17/17 green** — today 15/17; the 2 red gates are **pre-existing debt**, not feature work (see below)
- **e2e browser suite stable** — today 51/85; 34 failures = auth redirect-loop + page-load timeouts (peer auth WIP in flight); must be green without the loop
- **No committed-state-only gates** — GM role runtime effect must be committed (currently working tree), not "it works locally"

### Open → close (blocking release)

- [ ] **Lint-ts debt** — ~261 errors / **291 pre-existing files** (unicorn/max-nested-calls 89, sonarjs/cognitive-complexity 68, require-await 45, prefer-dom-node-append 36). Refactor tickets; `lint-ts` gate → green (15/17 → 16/17)
- [ ] **Size-strict debt** — 10 pre-existing files >250L (nsfw/battle/rpg) split or gate-exempt; → 17/17
- [ ] **e2e browser stabilization** — kill the auth redirect-loop (`/views/login?redirect=<nested login>`), fix page-load timeouts; chat-create/chat-flow flakes while auth WIP in flight
- [ ] **Unwired/leftover code close-out** — wire LoRA routes (`src/generation/lora/routes.ts`) or drop the module; remove dead `detectIntent`; fill swipe-variant placeholder via LLM pipeline (see backlog.md "Unwired Code" table)
- [ ] **Release artifacts** — `docs/meta/release-process.md`, signed tag `v0.1.0`, changelog/release notes; branch workflow (`TASK-branch-workflow-dev-stg-master.md:3` marked Post-0.1.0 — dev→stg→master stays post-hoc, but the tag + release-process land now)

### Hardening (do before tagging, not blockers)

- [ ] `memorySection` cross-actor integration test (P2-C hardening row)
- [ ] AUX queue M5–M6 (ModerationHook safety, AUX telemetry) — M1–M4 done (shared runner, memory-extraction real model, dead model roles, mood/emotion hook consumption)
- [ ] World timeline §5.3 forward-event steering + §5.4 cross-story convergence (cluster B greenfield)
- [ ] Frontend gaps still open in P2-B/C/D/E tables (music linking, message search, chat transfer, party join/leave, quest-log UI, assistant↔GM reconciliation, tool-call display, encryption-access UI, avatar-gallery visibility inheritance) — **align remaining work to the back-linked P4/P5 value rows in `backlog.md`**
- [ ] `.plan/open-items.md` — referenced by backlog but missing; create or drop references

### Ordering (proposed)

1. Land the in-flight GM role runtime effect + its test (uncommitted)
2. Close the 2 red `check` gates (lint-ts + size-strict) — biggest lever, 15/17 → 17/17
3. Stabilize browser e2e (auth loop is the dominant 34/85 failure)
4. Finish P2 feature tiers + AUX M5–M6 (M1–M4 done) + world-timeline cluster
5. P3–P5 value tiers (Core Foundation → Core Experience → Wiring/Search/Polish per 0.1.0 value list) + P6+ deferred
6. Post-P3 hardening → release-process + tag `v0.1.0`

---

## Milestone Gates

| Gate       | Trigger | Criteria                                                                                                                                                                                         |
| ---------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Gate A** | Post-P0 | All observability + testing infrastructure stable; Data Integrity Phase 1 complete; NSFW moderation live; Shared schemas enforced                                                                |
| **Gate B** | Post-P1 | Import/Export + Admin functional with encryption; NSFW integrations complete; Battle integrations complete; Data Integrity Phase 2 complete; Memory tiers wired with UI + cross-chat persistence |
| **Gate C** | Post-P2 | VN mode wired; chat system functional; assistant + tool calling integrated; GM flows operational; GM-guided story creation implemented; auth/access controls live; gallery usable                |
| **Gate D** | Post-P3 | P3–P5 0.1.0 value tiers operational (Core Foundation → Core Experience → Wiring/Search/Polish); P6+ deferred items non-blocking                                                                  |

---

## Notes

- **0.1.0 priority alignment (2026-08-05)**: P3→P5 follow the **0.1.0 highest-value features** (see `backlog.md` `## P3` for the full 22-item map + status). P3 Core Foundation (identity/access/encryption/chat/NSFW/i18n/VN/gallery/panels/LLM/assistant/IO/notifications/search/memory+template injection) → P4 Core Experience (not-yet-done value workstreams) → P5 Wiring, Search & Polish. Non-value work → **P6+** unless it blocks P3–P5. Cross-integration review: RPG mechanics matrix gaps (G1–G17) are P6+; NSFW (a P3 value) gaps G6–G9 are cross-enhancements blocked on deferred siblings — see `cross-mechanics-integration-matrix.md` §0.1.0 Alignment.
- **P0 items are blocking** — no safe multi-instance deployment without Data Integrity Phase 1; no NSFW content without moderation infrastructure; no cross-system data integrity without Shared Schemas
- **P2 emphasis**: VN mode → chat → assistant/tool calling → GM flows → GM-guided story creation → authorization/access → gallery. RPG mechanics deferred to P2-later.
- **VN mode is complete (backend + frontend, 2026-07-31)** — `src/story/` (6 route files) + `src/frontend/vn/` scene renderer/portrait/transitions/templates; remaining VN work is `bun test src/story/` verification + gallery-in-scene inheritance.
- **Chat system ties directly to assistant and GM flows** — implement in order: chat → assistant → GM → GM-guided story. Chat frontend has the most existing infrastructure (htmx + Alpine.js).
- **Authorization + access are blocking** — no safe multi-user deployment without register route and access checks. Backend `src/routes/auth.ts` and frontend login/register pages (`src/views/login.html`, `src/views/register.html`) are built; MFA deferred to P6+ (local-only auth), remaining access checks pending.
- **Gallery** — frontend (`src/frontend/pages/gallery.ts`) **and** backend are both implemented: list/upload served by `assetRoutes` (`GET/POST /api/assets`), gallery page + HTMX grid/search served by `viewRoutes` (`/views/gallery`, `/dynamic/gallery/*`) in `elysia-app.ts`. No `src/routes/gallery.ts` needed — asset routes already cover it.
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
- **Knowledge systems pair** — lore audience scoping + per-viewer memory injection shipped 2026-08-01 (see "Recent Wiring" table at top). Greenfield next: world timeline (`docs/spec/lore.md` §5) + event→lore promotion (§4) under `IDEA-memory-knowledge-isolation-and-world-timeline.md` (cluster B). Hardening: per-viewer `memorySection` cross-actor test.
- **Chat-setup-templates** (`IDEA-chat-setup-templates.md`) — ✅ shipped 2026-08-05: validated `ChatCreateBody` presets + `chat_setup_templates` table/API + `new-chat.html` selector (`new-chat.ts:29-67`).
