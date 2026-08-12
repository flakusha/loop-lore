# Epic: Configurable Template System

**Status:** 🟡 In Progress
**Priority:** High
**Effort:** Large
**Type:** Feature Epic / Configuration
**Tags:** llm, sd, avatar, image-edit, templates, yaml, merge
**Proposed Epic Branch:** epic/config-templates
**Depends on:** existing config loader, prompt templates, template registry

---

## Current State (2026-08-03)

| Phase                            | Domain                                                                      | State                                                                                                                                                                                                                                                                                                                   |
| -------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 1 — Template Config Loader | types + loader + merge + wiring                                             | ✅ Shipped (`src/config/sections/templates.ts`, `src/config/templates-loader.ts`, wired via `load.ts:517`)                                                                                                                                                                                                              |
| Phase 2 — SD Templates           | config-driven profiles                                                      | ✅ Loader + config surface shipped; consumption via `generation/prompt-templates.ts`                                                                                                                                                                                                                                    |
| Phase 3 — Avatar Templates       | emotion config + intent patterns                                            | ✅ Loader + config surface shipped; expansion via `config/template-expansion.ts`                                                                                                                                                                                                                                        |
| Phase 4 — LLM Integration        | system prompts + registry                                                   | ✅ **Shipped** — `LLM_PROMPT_DEFAULTS` (12 purposes) + `resolveSystemPrompt()` (`src/prompts/registry.ts`), 10 consumers wired (assistant/gm/vn/vnChoices/transition/intent/memory), commit `9aefe593`; design `.plan/epics/epic-config-templates.md`; registry hardening tracked by `TASK-prompt-template-registry.md` |
| Phase 4 — Image-Edit Integration | workflow registration                                                       | ✅ Loader + config surface shipped (`src/image-edit/template-registry.ts`)                                                                                                                                                                                                                                              |
| LLM cleanup                      | typed purposes, single defaults source, dead accessors, llm.yaml validation | 🟡 `TASK-prompt-template-registry.md` (design complete)                                                                                                                                                                                                                                                                 |

Design doc: `.plan/epics/epic-config-templates.md` — typed `PromptPurpose` union, `TEMPLATES_DEFAULTS.llm.systemPrompts` → `{}` (registry sole defaults source), dead accessor removal (`src/config/sections/llm-templates.ts`), llm.yaml load validation.

---

## Summary

Config-driven template system: replace, extend, or partially override in-app sane defaults
for generation templates via YAML files in config/templates/.

Four domains:

1. **LLM** - system prompts, chat format, summarization
2. **SD** - image model profiles, prompt templates, model matching
3. **Avatar** - emotion-to-asset mapping, intent patterns, emotion detection prompts
4. **Image-Edit** - ComfyUI workflow templates

Each domain supports three merge strategies:

- **replace** - wipe built-ins, use only config values
- **extend** - add new entries to built-ins (default)
- **override** - deep merge over built-ins (field-level)

---

## File Structure

    config/templates/
      llm.yaml          # LLM generation templates
      sd.yaml           # SD image generation profiles
      avatar.yaml       # Emotion avatars + intent patterns
      image-edit.yaml   # ComfyUI workflow templates

---

## Merge Semantics

Each file declares a merge key:

    merge: extend  # replace | extend | override

- replace: Entire domain replaced by config value
- extend: New entries added; config wins on key conflict
- override: Deep merge - config fields overlay built-in fields

---

## Loader Architecture

    config/templates/*.yaml
            |
      TemplateConfigLoader
        - finds files (same search path as main config)
        - parses YAML
        - applies merge strategy per domain
        - returns TemplatesConfig
            |
      Integrated into Config (src/config/schema.ts)

Reuses existing infrastructure:

- findConfigFile() from load.ts for file discovery
- parseFileContent() for YAML parsing
- deepMerge() for override strategy
- New: extend/replace logic per domain

---

## Domain Schemas

### LLM (config/templates/llm.yaml)

    merge: extend
    systemPrompts:
      chat: "You are {{charName}}. {{charDescription}}"
      summarize: "Summarize this conversation concisely."
      imagePrompt: "Write image generation tags for: {{scene}}"
      ooc: "You are the game master. Narrate the scene."
    chatFormats:
      alpaca:
        system: "### System:\n{system}\n### Instruction:\n{prompt}\n### Response:\n"
        user: "{message}"
        assistant: "{message}"

### SD (config/templates/sd.yaml)

    merge: extend
    profiles:
      myCustom:
        id: myCustom
        name: My Custom Model
        families: [custom]
        promptFormat: natural
        maxTokenHint: 300
        defaults:
          cfgScale: 7
          steps: 25
          sampler: euler
        templates:  # per detail level, per gen mode
          instant:
            yourself: "Briefly: describe {{charName}}. {{charDescription}}"
    modelMatching:
      - pattern: my-model
        profileId: myCustom

### Avatar (config/templates/avatar.yaml)

    merge: extend
    emotions:
      happy:
        asset: happy.png
        intent: "The character smiles warmly"
      sad:
        asset: sad.png
        intent: "The character looks downcast"
    intentPatterns:
      - pattern: smile
        emotion: happy
      - pattern: grin
        emotion: happy
      - pattern: cry
        emotion: sad

### Image-Edit (config/templates/image-edit.yaml)

    merge: extend
    workflows:
      upscale-4x:
        id: upscale-4x
        name: 4x Upscale
        category: upscale
        backend: comfyui
        description: "Upscale image 4x with ESRGAN"

---

## Implementation Phases

### Phase 1 - Template Config Loader

| Task                                        | Files                                 | Effort |
| ------------------------------------------- | ------------------------------------- | ------ |
| Define TemplatesConfig types                | src/config/sections/templates.ts      | Med    |
| Template config loader (find, parse, merge) | src/config/templates-loader.ts        | Med    |
| Wire into main Config schema                | src/config/schema.ts, schema-class.ts | Low    |
| Unit tests for merge strategies             | src/config/templates-loader.test.ts   | Med    |

### Phase 2 - SD Templates Integration

| Task                                    | Files                              | Effort |
| --------------------------------------- | ---------------------------------- | ------ |
| Config-driven profile registry          | src/generation/prompt-templates.ts | Med    |
| Config default YAML                     | config/templates/sd.yaml           | Low    |
| Migration: builtin profiles to defaults | src/generation/prompt-templates.ts | Low    |

### Phase 3 - Avatar Templates Integration

| Task                                  | Files                                           | Effort |
| ------------------------------------- | ----------------------------------------------- | ------ |
| Emotion config schema                 | src/config/sections/templates.ts                | Low    |
| Wire emotion-avatar section to config | src/assistant/prompt/sections/emotion-avatar.ts | Med    |
| Intent pattern matching               | src/assistant/intent.ts                         | Med    |
| Config default YAML                   | config/templates/avatar.yaml                    | Low    |

### Phase 4 - LLM + Image-Edit Integration

| Task                             | Files                               | Effort |
| -------------------------------- | ----------------------------------- | ------ |
| LLM system prompt config         | src/generation/prompt-templates.ts  | Med    |
| Config default YAML              | config/templates/llm.yaml           | Low    |
| Image-edit template registration | src/image-edit/template-registry.ts | Med    |
| Config default YAML              | config/templates/image-edit.yaml    | Low    |

---

## Testing Strategy

| Test        | Coverage                              | Files                                                |
| ----------- | ------------------------------------- | ---------------------------------------------------- |
| Unit        | Merge strategy correctness            | src/config/templates-loader.test.ts                  |
| Unit        | Extend adds new, override deep-merges | src/config/templates-loader.test.ts                  |
| Unit        | Replace wipes defaults                | src/config/templates-loader.test.ts                  |
| Unit        | SD profile resolution from config     | src/generation/prompt-templates.test.ts              |
| Unit        | Avatar emotion resolution from config | src/assistant/prompt/sections/emotion-avatar.test.ts |
| Integration | Config change to template refresh     | tests/integration/                                   |

---

## References

- src/config/load.ts - existing config loader with deepMerge
- src/generation/prompt-templates.ts - SD prompt templates (BUILTIN_PROFILES)
- src/image-edit/template-registry.ts - ComfyUI template registry
- src/assistant/prompt/sections/emotion-avatar.ts - emotion avatar section
- src/assistant/intent.ts - avatar change intent detection

## Related Epics

- Epic Config Extensions (epic-config-extensions.md) - extensible enum mechanism
- Epic ComfyUI Plugin - image-edit integration
- Epic Character Core System - mood/emotion/avatar

---

## Merged from `.plan/epics/epic-config-templates.md`

# Chat Template & Config Lifecycle — Research & Design

**Status:** Design (research complete)
**Created:** 2026-08-02
**Scope:** Chat setup templates (selectable at creation) + online-chat configuration policy
**Preference (owner):** **Bound-chat migration to a new chat** over live mutation of key mechanics.

---

## 1. Problem

Two gaps in the current chat config surface:

1. **Creation-time**: `POST /api/chats` accepts a rich `ChatCreateBody` (`src/validation/schemas.ts:157`),
   but `new-chat.html` only sends `name`, `type`, `mode`, `participantIds`, `personaId`,
   `impersonateActorId`, `memoryCarry`. `turnStrategy`, `worldId`, `currentLocationId`,
   `gmConfig`, `visualNovel` are API-only — unreachable from the creation form.
2. **Online-time**: `PATCH /api/chats/:id` → `updateChat` (`src/chat/service.ts:179`) mutates
   `mode`, `turnStrategy`, `worldId`, `gmConfig`, `visualNovel` **live**, with no guard except
   the admin panel-freeze. A chat with a live conversation can have its foundational mechanics
   swapped underneath it, corrupting narrative/mechanical continuity.

This design resolves both with one model: **templates are bound at creation; key mechanics are
immutable once the chat is online; changing key mechanics requires migrating to a new chat.**

---

## 2. Current State (verified)

| Concern                         | Location                                                                  | Behavior                                                                                  |
| ------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Create body                     | `src/validation/schemas.ts:157` `ChatCreateBody`                          | Rich: type, mode, turnStrategy, worldId, currentLocationId, gmConfig, visualNovel         |
| Create handler                  | `src/routes/chats.ts` `.post("/api/chats")`                               | Passes subset through to `createChat`                                                     |
| Update body                     | `src/validation/schemas.ts:171` `ChatUpdateBody`                          | name, mode, turnStrategy, worldId, isPinned, isPaused, freezePanel, gmConfig, visualNovel |
| Update service                  | `src/chat/service.ts:179` `updateChat`                                    | Writes mode/turnStrategy/worldId/gmConfig/visualNovel unconditionally                     |
| Only online guard               | `src/chat/service.ts:191` panel-freeze (admin)                            | Blocks all settings when `isPanelFrozen`, non-admin                                       |
| ChatType/ChatMode/ResponseStyle | `.plan/epics/epic-chat-lifecycle-moderation.md`                           | 3-axis split; `mode` currently overloaded (`direct`/`group`/`story`)                      |
| Creation presets idea           | `.plan/tickets/IDEA-chat-setup-templates.md`                              | `ChatSetupTemplate` = validated `ChatCreateBody` preset                                   |
| Existing migration/fork hook    | `chats.parent_chat_id` (`src/db/migrations/parts/004_chats_actors.ts:19`) | Side-chat / fork linkage; SET NULL on delete                                              |
| Location change (sanctioned)    | `PUT /api/chats/:id/location`                                             | Dedicated runtime op; also `transfer` endpoint exists                                     |

---

## 3. Design

### 3.1 Two categories of chat config

Split every chat-config field into **key mechanics** (foundational, immutable once online) vs
**session state** (runtime, mutable online).

**Key mechanics (immutable once online):**

- `mode` (behavioral: story / battle / question / inventory — post-reconciliation)
- `turnStrategy` (round_robin / scene_based / initiative / quest_driven / hybrid)
- `gmConfig.assistantRole` (off / helper / gm / moderator) + `visualNovel`
- `worldId` (world binding)
- `responseStyle` (+ `response_style_custom`) — post-reconciliation
- `type` (direct/group) — already set at creation

**Session state (mutable online):**

- `name`, `isPinned`, `isPaused`, `freezePanel` (admin)
- `currentLocationId` — runtime travel, already dedicated endpoint
- participant add/remove (separate concern)

Rationale: key mechanics change _how the story/mechanics are generated and orchestrated_.
Changing them mid-conversation breaks continuity, invalidates in-flight turns, and desyncs
memory/world state. Session state affects only presentation/UX and is safe to flip live.

### 3.2 "Online" definition

A chat is **online** once it has at least one confirmed message (or an active story turn).
Before that it is a **draft** and key mechanics remain editable. This is a cheap, unambiguous
check: `EXISTS(SELECT 1 FROM messages WHERE chat_id = ? AND status = 'confirmed')`.

### 3.3 Templates bound at creation

Per `IDEA-chat-setup-templates.md`:

- `chat_setup_templates` table (or config-declared presets) keyed by slug; each row a validated
  `ChatCreateBody`-shaped preset with sane limits.
- `GET /api/chat-setup-templates` to list; `POST /api/chats` accepts optional `templateId` that
  seeds the create body (explicit user fields override).
- `new-chat.html` template `<select>` pre-fills hidden + visible fields.
- Record the bound template on the chat: add `chats.template_id` (nullable, FK to
  `chat_setup_templates`). This is the **binding** — the template that established the chat's
  key mechanics.

### 3.4 Online enforcement (bound, immutable)

`updateChat` gains a guard: if the chat is online **and** the request attempts to mutate any
**key-mechanic** field, reject with a 409 + a structured error pointing the user to the
migration endpoint (below). Session-state fields still pass through.

Mechanic fields are stripped from `ChatUpdateBody` for online chats (or rejected per-field) so
the UI settings modal never offers them as editable once online.

### 3.5 Migration to a new chat (the owner's preferred path)

To change key mechanics, the user **migrates**: create a **new chat** bound to a different
template, carrying over continuity. This reuses the existing `parent_chat_id` fork hook.

New endpoint: `POST /api/chats/:id/migrate`

```jsonc
{
  "templateId": "advanced-roleplay",
  "carry": {
    "participants": true, // copy chat_participants
    "memory": true, // copy actor_memories / memory carry
    "history": "summary", // "none" | "summary" | "full"
    "state": true, // copy story_turns, quest_progress, group_initiatives (party/game state)
    "pins": true, // copy chat_pins, vn_choices
    "worldState": true // copy world/npc/location state (only when migrating to a different world)
  },
  "name": "optional new name"
}
```

Behavior:

1. Validate target template + ownership.
2. Create new chat with `parent_chat_id = sourceChatId`, seeded from the template's
   `ChatCreateBody` (key mechanics come from the **new** template).
3. Optionally copy participants, memory, a summary/full history, and party/game state.
4. Archive the source chat (or leave it as a read-only branch).
5. Return `{ newChatId, sourceChatId }`; UI swaps to the new chat with a "migrated from" banner.

**Party-transfer carry (implemented):** `carry.state` re-points the chat-scoped party/game
state (`story_turns`, `quest_progress`, `group_initiatives`) to the migrated chat. `carry.pins`
carries `chat_pins` + `vn_choices`. `carry.worldState` copies world-scoped snapshots
(`world_states`, `npc_states`, `location_states`) only when the new template binds a
**different world** (same-world migrations already share them).

This keeps the source chat intact (history preserved), gives a clean continuity boundary, and
satisfies the preference: **you cannot change key mechanics in place — you fork to a new chat.**

### 3.6 Relationship to mode reconciliation & overlays

- Templates select `mode`; the 3-axis split (`chat-mode-reconciliation.md`) must land first so
  templates pick a real behavioral mode, not the overloaded `direct|group|story`.
- Battle (`TASK-chat-battle-mode-switch.md`) and VN-start are **mode overlays**. Per the
  reconciliation doc, toggling a transient overlay (enter/exit battle) is generation-only and
  safe to switch online **if** it does not change key mechanics. Recommendation: treat battle
  enter/exit as a **session-state overlay toggle** (mutable online), but the _chat's_ bound
  `mode`/`turnStrategy` remain immutable. Define each overlay's mutability explicitly to avoid
  ambiguity.
- `gmConfig` human/hybrid GM is unreachable from UI today (shape gap in
  `epic-assistant-gm-flows.md`); templates should wait on or drive that reconciliation.

---

## 4. Open Questions

1. **History carry fidelity** — "summary" vs "full" history on migration: does full carry
   preserve message tree + swipes, or only the active leaf path? Recommend active-leaf + memory.
2. **Source chat disposition** — archive vs keep-active-branch? Recommend archive (read-only)
   to avoid two live chats competing for the same narrative.
3. **Overlay mutability** — which overlays (battle, VN) are session-mutable vs bound mechanics?
   Needs a per-overlay policy table.
4. **Template versioning** — if a template is edited, do existing bound chats pick up changes?
   Recommend **no** (binding is a snapshot); only new chats see the new version.
5. **Migration idempotency** — guard against duplicate migrations from the same source.

---

## 5. Files to Touch (implementation phase, later)

- `src/db/migrations/0XX_chat_setup_templates.ts` — `chat_setup_templates` table + `chats.template_id`
- `src/validation/schemas.ts` — `ChatSetupTemplateSchema`, `ChatMigrateBody`, strip mechanics from `ChatUpdateBody`
- `src/chat/service.ts` — `updateChat` online guard; `migrateChat`; `isChatOnline`
- `src/routes/chats.ts` — `GET /api/chat-setup-templates`, `POST /api/chats/:id/migrate`
- `src/views/new-chat.html` + `src/frontend/alpine/new-chat.ts` — template selector
- `src/components/chat/chat-settings-modal.html` — hide key-mechanic fields when online
- `docs/frontend/chat/templates.md` — user-facing doc (see deliverables)

---

## 6. Deliverables

- This design doc (`.plan/epics/epic-config-templates.md`)
- `.plan/tickets/IDEA-chat-setup-templates.md` — updated with online-config policy + migration
- `.plan/tickets/FEAT-chat-template-config-lifecycle.md` — implementation ticket (new)
- `docs/frontend/chat/templates.md` — user-facing feature doc (new)
- `.plan/tickets/FEAT-message-swipe-replay-branch.md` — swipe/regenerate/replay mechanic (new) — session-state op, always allowed online (interlinked)

---

## Merged from `.plan/epics/epic-config-templates.md`

# Prompt Template Registry — Design

**Status:** Design
**Created:** 2026-08-03
**Scope:** Config-driven LLM text templates for assistant / gm / nsfw (+ vn + aux classifier) domains — single typed registry over the existing config-enhance machinery.
**Related:** `FEAT-chat-template-config-lifecycle.md` (chat setup templates — distinct domain, same "templates bound at creation" philosophy), `src/prompts/registry.ts`, `src/config/templates-loader.ts`, `src/config/sections/templates.ts`.

---

## 1. Problem

LLM system prompts for assistant / gm / nsfw / vn / aux classifiers are scattered across modules (`assistant-system.ts`, `vn.ts`, `aux-pipeline/prompts.ts`, `GM_SYSTEM_PROMPT`/`NSFW_POLICY_PROMPT` in `registry.ts`) and resolved through a code-defaults registry (`src/prompts/registry.ts`) layered under user config files (`configs/templates/llm.yaml`). The config-enhance machinery exists and is wired, but the registry is **untyped, has duplicated defaults, dead accessors, and an unwired nsfw purpose**.

## 2. Current State (verified 2026-08-03)

| Concern                       | Location                                                                                                                                                                                                                                                        | State                                                                                                                                                                         |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Config-enhance loader (merge) | `src/config/templates-loader.ts`                                                                                                                                                                                                                                | extend/override/replace per domain; llm merges `systemPrompts` + `chatFormats`                                                                                                |
| Config shapes + defaults      | `src/config/sections/templates.ts` `LlmSystemPrompts`/`LlmTemplateConfig`/`TEMPLATES_DEFAULTS`                                                                                                                                                                  | `LlmSystemPrompts` types only 4 keys (chat/summarize/imagePrompt/ooc); rest hidden behind `[key: string]: string`; `TEMPLATES_DEFAULTS.llm.systemPrompts` has the same 4 keys |
| Code registry                 | `src/prompts/registry.ts` `LLM_PROMPT_DEFAULTS` (12 purposes) + `resolveSystemPrompt(templates, purpose)`                                                                                                                                                       | Source of truth for defaults; resolution = config override → code default                                                                                                     |
| Consumers (wired)             | assistant (`sections/system.ts`, `seed.ts`, `generate-route.ts`), gm (`game-master.ts`→`gm/decisions/llm.ts`, `auto-gen.ts`), vn/vnChoices (`vn-generate.ts`), transition (`transition-classifier.ts`), intent (`auto-gen.ts`), memory (`memory/extraction.ts`) | ✅ all call `resolveSystemPrompt`                                                                                                                                             |
| **nsfw purpose**              | `NSFW_POLICY_PROMPT` in `registry.ts`                                                                                                                                                                                                                           | ✅ **wired** (2026-08-04): `NsfwHook` LLM classifier when `nsfw.useLlmClassifier`                                                                                             |
| Legacy purposes               | `chat`, `summarize`, `imagePrompt`, `ooc` in `LLM_PROMPT_DEFAULTS`                                                                                                                                                                                              | ⚠️ zero runtime consumers (actors define own `system_prompt`; SD image prompts use `generation/prompt-templates.ts` `renderTemplate`, not this)                                |
| Dead accessors                | `src/config/sections/llm-templates.ts` (`getSystemPrompt`/`getAllSystemPrompts`/`getChatFormat`/`listChatFormats`)                                                                                                                                              | ❌ zero consumers — superseded by `resolveSystemPrompt`                                                                                                                       |
| `chatFormats`                 | `LlmTemplateConfig.chatFormats` (Jinja/vLLM-style system/user/assistant)                                                                                                                                                                                        | ⚠️ defined + config-loadable, **zero consumers**                                                                                                                               |
| `{{var}}` interpolation       | `generation/prompt-templates.ts` `renderTemplate` (SD only)                                                                                                                                                                                                     | LLM system prompts are **static** — `chat` default's `{{charName}}` never expands                                                                                             |

## 3. Design

### 3.1 Typed purpose union (fixes untyped purposes)

Introduce a first-class purpose set so config keys and registry defaults are checked, not free-form strings.

```ts
// src/prompts/purposes.ts
export const PROMPT_PURPOSES = [
  "chat",
  "summarize",
  "imagePrompt",
  "ooc", // legacy
  "assistant",
  "gm",
  "nsfw",
  "vn",
  "vnChoices", // generation domains
  "transition",
  "intent",
  "memory", // aux classifiers
] as const;
export type PromptPurpose = typeof PROMPT_PURPOSES[number];
```

`LlmSystemPrompts` keeps an index signature for user-defined custom purposes (config `systemPrompts.<custom>` must stay legal), but the twelve known purposes become named, typed keys. `resolveSystemPrompt` keeps its `string` purpose param but gains a `PromptPurpose`-typed overload for the known set.

### 3.2 Single source of truth (kills the duplicate defaults)

Today `TEMPLATES_DEFAULTS.llm.systemPrompts` repeats the same four values as `LLM_PROMPT_DEFAULTS` — two sources of truth that can drift.

- **`LLM_PROMPT_DEFAULTS` (in `src/prompts/registry.ts`) remains the single defaults source.** It owns the sub-prompt imports (`assistant-system`, `vn`, `aux-pipeline/prompts`), so the config layer never has to import generation-layer modules.
- **`TEMPLATES_DEFAULTS.llm.systemPrompts` → `{}`.** The config layer becomes _user overrides only_; `extend` merge then layers user keys onto an empty base, and `resolveSystemPrompt` supplies code defaults. This removes the duplication without inverting the import layering (config stays below prompts).
- `mergeLlmConfig` (extend/override) already spreads `...base.systemPrompts` then `...override.systemPrompts` — with `{}` base this is a no-op for defaults and still lands user keys. No loader change needed.
- **Update `src/config/templates-loader.test.ts`** assertions that rely on `TEMPLATES_DEFAULTS` carrying the four default prompts (they should now assert user-override merge only).

### 3.3 Remove dead accessors

Delete `src/config/sections/llm-templates.ts` (`getSystemPrompt`, `getAllSystemPrompts`, `getChatFormat`, `listChatFormats`) — zero consumers, superseded by `resolveSystemPrompt` + direct `config.templates.llm` access. This is a mechanical deletion; verify no imports remain.

### 3.4 Wire the nsfw purpose (✅ done 2026-08-04)

`NSFW_POLICY_PROMPT` is wired: when `nsfw.useLlmClassifier` is enabled, `NsfwHook` calls
`resolveSystemPrompt(config.templates.llm, "nsfw")` via `callAux("nsfw", …)` to classify content
the keyword pass missed, falling back to "none" (never blocks generation on an LLM error).
The `nsfwPolicy` purpose (`NSFW_POLICY_LEVELS_PROMPT`) is injected as a system section
(`src/assistant/prompt/sections/nsfw-policy.ts`) into assembled prompts when NSFW is allowed.

### 3.5 Validate llm.yaml on load (fail fast)

`loadTemplateConfig` currently does `raw as Partial<LlmTemplateConfig>` — a silent cast. Add a small runtime validator on the llm domain: `systemPrompts` values must be strings, `chatFormats` must be `{system,user,assistant}` shapes, `merge` must be a legal `MergeStrategy`. Reject malformed files with a clear error (mirroring the existing `Failed to load template config` throw). Keep it dependency-light (hand-rolled, no zod — the codebase uses Elysia `t`).

### 3.6 Legacy purposes + chatFormats — decision

- `chat`/`summarize`/`imagePrompt`/`ooc`: **keep in `LLM_PROMPT_DEFAULTS`** (harmless, documented, plausible near-future consumers: context compression → `summarize`). Mark legacy in the purpose union doc comment. Do not delete.
- `chatFormats` (vLLM-style): **keep dormant**, same as nsfw — config surface exists, no consumer today. Add a `docs/` note; wire separately if a chat-formatting path lands.

### 3.7 Variable interpolation (future, not in this task)

`{{charName}}` / `{{charDescription}}` in defaults never interpolate for LLM prompts (only SD image templates use `renderTemplate`). Document as a future enhancement: reuse `renderTemplate` from `generation/prompt-templates.ts` with a per-purpose context. Out of scope for the registry cleanup.

## 4. Deliverables

| # | Change                                                                               | File(s)                                                               |
| - | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| 1 | Add `PromptPurpose` union + typed keys on `LlmSystemPrompt`                          | `src/prompts/purposes.ts`, `src/config/sections/templates.ts`         |
| 2 | Empty `TEMPLATES_DEFAULTS.llm.systemPrompts`; keep `LLM_PROMPT_DEFAULTS` sole source | `src/config/sections/templates.ts`, update `templates-loader.test.ts` |
| 3 | Delete dead accessors                                                                | `src/config/sections/llm-templates.ts` (rm)                           |
| 4 | Add llm.yaml runtime validation                                                      | `src/config/templates-loader.ts`                                      |
| 5 | Docs: legacy purposes + chatFormats dormancy + nsffw wiring pointer                  | this doc + `configs/templates/llm.example.yaml`                       |
| 6 | Tests: purpose typing, empty-default merge, validation rejection                     | `src/prompts/registry.test.ts`, `src/config/templates-loader.test.ts` |

## 5. Out of scope (later tickets)

- ~~NSFW LLM classifier consumer wiring (~~ `src/nsfw/moderation-service.ts` ~~)~~ — **done 2026-08-04** (`nsfw.useLlmClassifier` + `NsfwHook` LLM path)
- `{{var}}` interpolation for LLM prompts
- `chatFormats` consumer (chat formatting path)
- Legacy purpose removal/retirement
- Chat _setup_ template lifecycle (`FEAT-chat-template-config-lifecycle.md`) — separate domain

## 6. Risks / notes

- Import layering kept: `config/sections/templates.ts` must NOT import `src/prompts/registry.ts` (cycle/layering). Defaults stay in the registry; config stays override-only.
- `templates-loader.test.ts` and `registry.test.ts` will need updates — they assert the current four-key defaults.
- No schema regeneration required (no DB migration).
- `bun run check` gate: this task touches only `src/` + docs — expect same 15/17 baseline (lint-ts + size-strict remain pre-existing debt).
