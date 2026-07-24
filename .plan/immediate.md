# Immediate Plan — Backend/Frontend Reconciliation Gaps

> **Temporary document** — compiled for current issues only.
> Not a permanent spec. Generated: 2026-07-24. Source: Reconciliation of 12 high-priority features
> (chat, group chat, character setup, assistant, impersonation, mood, context
> window sliding, emotional avatar, visual novel, assistant/GM,
> encryption+compression, NSFW features)
>
> **Implementation**: Separate worktrees per feature group (see §Implementation Strategy below).

---

## Reconciliation Status (2026-07-24)

### Merged Branches

| Branch                | Commit    | Status     | Notes                                            |
| --------------------- | --------- | ---------- | ------------------------------------------------ |
| `mood-frontend`       | `4e8d5d8` | ✅ Clean   | Mood UI merged                                   |
| `assistant-gm-schema` | `02c9038` | ✅ Clean   | GM typed schema merged                           |
| `admin-portal`        | `74e8386` | ✅ Clean   | Admin portal features merged                     |
| `llm-sd-injection`    | `361f799` | ⚠️ Conflict | `admin-templates.ts` — kept admin-portal version |
| `nsfw-features`       | `bb0b319` | ⚠️ Deferred | Test failures (character_arousal table)          |
| `emotional-avatar`    | `37508ba` | ⚠️ Conflict | `registry.ts` — kept both sections               |

### Deferred Items (To Reconcile)

| # | Issue                                                              | Severity | Status      |
| - | ------------------------------------------------------------------ | -------- | ----------- |
| 1 | `character_arousal` table missing in test DB — test failures       | HIGH     | Open        |
| 2 | Migration `027_template_injection` missing `down()`                | HIGH     | Open        |
| 3 | Schema sync: `template_overrides` column in DB but not in manifest | HIGH     | Open        |
| 4 | `nsfw-features` test failures deferred                             | HIGH     | Open        |
| 5 | `stg`/`dev` branches need worktree.sh support                      | MEDIUM   | Open        |
| 6 | `.plan/immediate.md` update during reconciliation                  | MEDIUM   | In Progress |

### Fast Reviews & Hooks (New Concern)

Fast reviews' and functionality extends — hooks using main/aux LLM on content for triggering events:

- **Mood triggers** — LLM detects mood shifts in content, fires `POST /api/actors/:id/mood/delta`
- **Emotion triggers** — content analysis triggers emotion avatar selection changes
- **NSFW gating** — content moderation hooks check NSFW policy before generation
- **Moderation events** — content flagged by LLM triggers moderation workflows
- **Privacy basis** — all hooks respect NSFW allowance and privacy levels

### Test Coverage Gap

Overall coverage with unit tests to confirm FExBExDB harmonization post-merge is insufficient.
Need expanded test suite covering:

- Migration up/down roundtrips
- Schema manifest ↔ DB column parity
- Service-layer integration with test DB
- Route handler validation

### Low-Hanging Fruit (To Resolve)

- [ ] Fix `027_template_injection` — add `down()` function
- [ ] Add `character_arousal` table to test DB schema (ensure migrations run in test DB)
- [ ] Sync `template_overrides` into `schema-manifest.ts`
- [ ] Add `stg`/`dev` to `PROTECTED_BRANCHES` in `worktree.sh`
- [ ] Resolve `nsfw-features` test failures
- [ ] Resolve `llm-sd-injection` conflict in `admin-templates.ts`
- [ ] Resolve `emotional-avatar` conflict in `registry.ts`

### Tasks to Close Upon Confirmation

- [ ] Confirm all 6 merged branches pass `bun run check` and `bun test src/`
- [ ] Close `nsfw-features` deferred test failures
- [ ] Close migration `027_template_injection` `down()` gap
- [ ] Close schema manifest sync gap
- [ ] Reconcile epics — update `.plan/epics.md` with current state
- [ ] Structure epics for future dev separation
- [ ] Update `.plan/immediate.md` with final reconciliation state

---

## Summary of Findings

| Feature                | Backend      | Frontend     | Route | Gap                                                                                         |
| ---------------------- | ------------ | ------------ | ----- | ------------------------------------------------------------------------------------------- |
| Chat                   | ✅           | ✅           | ✅    | None                                                                                        |
| Group Chat             | ✅           | ✅           | ✅    | None                                                                                        |
| Character Setup        | ✅           | ✅           | ✅    | None                                                                                        |
| Assistant              | ✅ (MVP)     | ✅           | ✅    | None                                                                                        |
| Impersonation          | ✅           | ✅           | ✅    | None                                                                                        |
| Mood                   | ✅           | ❌           | ✅    | Frontend missing                                                                            |
| Context Window Sliding | ✅           | ✅           | ✅    | None                                                                                        |
| Emotional Avatar       | ✅ (service) | ❌           | ❌    | Route + frontend missing; creation/usage flow defined; SD/ComfyUI dynamic backend selection |
| NSFW Features          | ⚠️ (config)   | ❌           | ❌    | Frontend missing; no NSFW gating route; policy detection exists but not wired to generation |
| Visual Novel Mode      | ❌           | ❌           | ❌    | Skipped (not implemented)                                                                   |
| Assistant/GM           | ⚠️ (raw JSON) | ⚠️ (raw JSON) | ⚠️     | Typed schema missing                                                                        |
| Encryption/Compression | ✅           | ✅           | ✅    | Remaining work items                                                                        |

---

## Implementation Strategy

All feature work happens in **separate worktrees** using `./scripts/worktree.sh`. This enables parallel implementation across feature groups without merge conflicts.

### Worktree Mapping

| Worktree                 | Features                                           | Priority |
| ------------------------ | -------------------------------------------------- | -------- |
| `mood-frontend`          | Mood UI (§1)                                       | HIGH     |
| `emotional-avatar`       | Emotional avatar route + frontend (§2)             | HIGH     |
| `nsfw-features`          | NSFW frontend + gating + policy integration (§2.5) | HIGH     |
| `assistant-gm-schema`    | Assistant/GM typed schema (§3)                     | MEDIUM   |
| `sd-comfyui-integration` | SD.CPP/ComfyUI steps (§4)                          | HIGH     |
| `llm-sd-injection`       | LLM/SD template injection (§5)                     | MEDIUM   |
| `admin-portal`           | Admin portal high-value features (§8)              | MEDIUM   |
| `stg`                    | Staging — pre-merge validation                     | MEDIUM   |
| `dev`                    | Dev — feature development w/ fewer restrictions    | MEDIUM   |

### Shared Base

All worktrees branch from `master`. Merge order follows priority:

1. `mood-frontend` → `emotional-avatar` → `nsfw-features` (HIGH, sequential due to shared character schema)
2. `sd-comfyui-integration` → `assistant-gm-schema` (MEDIUM, can merge in parallel with HIGH)
3. `llm-sd-injection` → `admin-portal` (lower priority, merge last)

### Cross-Cutting Concerns

- **Character schema changes** (NSFW policy, mood, emotional avatar) — implement in `mood-frontend` or `nsfw-features` worktree first; other worktrees pull from master after merge
- **SD/ComfyUI provider config** — implement in `sd-comfyui-integration`; `emotional-avatar` depends on this
- **Admin portal** — `nsfw-features` and `sd-comfyui-integration` both need admin provider selection; coordinate via shared branch or implement admin first

---

## Gaps & Action Items

### 1. Mood Frontend — HIGH

**Backend**: Complete (`MoodService`, `routes/character-mood.ts`,
`character_emotions` table) **Frontend**: Missing — no mood UI in chat settings
or anywhere else

**Tasks**

- [ ] Add mood/emotion panel to chat sidebar or character settings
      (`src/frontend/alpine/`)
- [ ] Wire `GET /api/actors/:actorId/mood` into Alpine component
- [ ] Wire `POST /api/actors/:actorId/mood/delta` for happiness slider
- [ ] Wire `GET /api/actors/:actorId/emotions` for emotion display
- [ ] Add mood display to character detail modal
      (`src/frontend/pages/characters.ts`)

**Epic**: `epic-character-core-system.md` **Related tickets**:
`TASK-character-mood-happiness.md`,
`TASK-character-mood-swings-happiness-meter.md`

---

### 2. Emotional Avatar — Route + Frontend Missing (with Creation/Usage Flow)

**Backend**: Service exists (`emotion-avatar-service.ts`, `avatar-service.ts`)
but no route exposes it **Frontend**: No emotion avatar UI

#### Creation Flow

- After avatar load (user, character), if successful and avatar picture setup is
  complete — propose generation
  - Local machine: sequential generation recommended
  - External Stable Diffusion Image Edit API: multiple avatar generation
    possible
- Generation follows the set default config option
- Additional gitignored `configs/*.config.toml` can be merged into default
  config on app start (example required)

#### Chat Usage

- Aux (or main — if Aux not set) LLM detects intent to change avatar and
  attaches emotion to finalized response
- Chat message displayed with custom emotion avatar, falling back to default one

#### Resource Constraint — Dynamic Backend Selection (Practical Solution)

- sd-server (sd.cpp) spawns a new process per generation — no shared memory with
  other processes
- ComfyUI runs as a persistent server (port 8188) consuming significant GPU/RAM
- sd-server and ComfyUI should NOT run simultaneously on the same machine due to
  resource contention
- **Practical solution**: Dynamic backend discovery + selection at generation
  time, not mutual exclusion
  - Admin panel configures both backends but marks one as `preferred` per
    category
  - Runtime discovery checks which backends are healthy/available at generation
    time
  - If ComfyUI is busy (queue depth > threshold), fall back to sd-server
  - If sd-server is at capacity (concurrent generations > limit), fall back to
    ComfyUI
  - Each provider has independent rate limiting and concurrency controls
  - sd-cli (if implemented) is a 1-shot fallback — single process, no daemon,
    immediate exit after generation

**SD.CPP Integration** (via `sd-server`):

- Config exists in `src/config/schema.ts` (`sd-server` port, spawn toggle, model
  path)
- `src/assistant/sd.ts` has `SDRequest`/`SDResponse` interfaces and
  `SDProviderConfig`
- `src/image-edit/providers/sd-server-provider.ts` exists for SD server
  integration
- `sdConfig.apiFamily` supports `"openai" | "sdapi" | "sdcpp"` — sd.cpp is the
  default
- **Already wired**: sd-server handles txt2img and img2img via its API;
  `ImageGenBody` already supports `n` (1-4), steps, cfgScale, sampler, seed,
  denoising strength, hires upscale
- **Missing for emotional avatar**: Wire emotion tags into SD prompt generation,
  add `emotion` field to `SDRequest`, register sd-server as an image generation
  provider in the generation provider registry
- **1-shot vs repeat**: sd-server handles this natively via `n` parameter
  (already supports concurrent generations up to 4)
- **Rate limiting**: No rate limiting exists for sd-server/ComfyUI — must be
  added per provider to prevent GPU exhaustion

**ComfyUI Integration** (via `src/generation/providers/comfyui.ts`):

- `ComfyUIClient` exists with `submitWorkflow()` and `pollExecution()`
- `src/image-edit/providers/comfyui-provider.ts` exists for image editing
- **Missing**: Create emotion-avatar workflow template (node graph with emotion
  conditioning), register template in `ComfyUIWorkflow` type, map `EmotionType`
  enum values → ComfyUI node parameters, add `POST /api/admin/comfyui/workflows`
  route for template management

*_Tasks_:

- [ ] Create `routes/character-emotion-avatars.ts` with endpoints:
  - `POST /api/actors/:actorId/emotion-avatars` — trigger batch generation
  - `GET /api/actors/:actorId/emotion-avatars` — list generated avatars
  - `GET /api/actors/:actorId/emotion-avatars/:emotion` — get specific emotion
    variant
- [ ] Build frontend avatar selector with emotion context awareness
- [ ] Wire `emotionAvatar` field into `AvatarSelectionContext` in prompt
      assembler
- [ ] Add `emotion` field to `SDRequest` interface in `src/assistant/sd.ts`
- [ ] Add `emotion` parameter to `sd-server` prompt generation in
      `sd-server-provider.ts`
- [ ] Add `emotion` → ComfyUI node parameter mapping in `comfyui-provider.ts`
- [ ] Create emotion-avatar workflow template for ComfyUI (emotion conditioning
      node)
- [ ] **CRITICAL**: Add admin panel provider selection — allow choosing
      sd-server OR ComfyUI per operation, with dynamic fallback routing
- [ ] Add rate limiting per SD provider (max concurrent generations, queue
      depth)
- [ ] Add sd-server process lifecycle management — ensure only one sd-server
      instance runs, port conflict detection, auto-restart on crash
- [ ] Add sd-cli 1-shot execution logic (if sd-cli is implemented) —
      single-process, no daemon, immediate exit after generation
- [ ] Add sd-cli repeat execution logic — queue multiple generations, reuse
      single process where possible (sd-cli creates new process per call, no
      shared memory between runs)

**Epic**: `epic-character-core-system.md`, `epic-comfyui-plugin.md` **Related
tickets**: `TASK-emotion-avatar-edit-model.md`,
`TASK-emotions-avatar-edit-model.md`,
`TASK-comfyui-plugin-workflow-templates.md`,
`TASK-comfyui-template-registry.md`, `FEAT-065-sub-image.md`

---

### 2.5 NSFW Features — HIGH (New)

**Current state**: Backend config exists (`NsfwConfig` with `allowNsfw`, `nsfwMinAge`), character schema has `nsfw_policy` column (JSON), NSFW enum levels defined (`mild`, `moderate`, `intense`, `extreme`), policy detection in generation pipeline. **Frontend**: No NSFW controls in character setup or chat settings. **Routes**: No NSFW gating route — character availability accepts `nsfwPolicy` in body but no dedicated NSFW management endpoint.

**Gap**: NSFW features are backend-configured but not exposed through the frontend or properly gated at generation time.

*_Tasks_:

- [ ] Add NSFW panel to character creation/edit frontend (`src/frontend/pages/characters.ts`) — allow selecting NSFW policy level per character
- [ ] Add NSFW toggle to chat settings frontend — per-chat NSFW policy override
- [ ] Add `POST /api/admin/nsfw/policy` route for admin-level NSFW policy management
- [ ] Add NSFW gating in generation pipeline — check `nsfw_policy` against `NsfwConfig.allowNsfw` and `nsfwMinAge` before generating NSFW content
- [ ] Add age-gate verification endpoint that checks user birth_date against `nsfwMinAge` before allowing NSFW content
- [ ] Wire `nsfw_policy` from character schema into prompt assembly — inject NSFW policy context into LLM prompt
- [ ] Add NSFW comfort/privacy level integration with memory injection system (memory sections should respect NSFW privacy levels)

**Epic**: `epic-character-core-system.md` (NSFW is part of character system)
**Related tickets**: `TASK-nsfw-body-physical.md`, `TASK-nsfw-encounter-system.md`, `TASK-nsfw-fantasy-kink.md`, `TASK-nsfw-gate-moderation-events.md`, `TASK-nsfw-intimacy-system.md`, `TASK-nsfw-mood-emotional.md`, `TASK-nsfw-pheromones-chemistry.md`, `TASK-nsfw-pregnancy-reproduction.md`, `TASK-nsfw-reputation-social.md`, `TASK-nsfw-seduction-desire.md`, `TASK-nsfw-skills-experience.md`, `TASK-nsfw-species-mechanics.md`, `TASK-nsfw-trauma-recovery.md`

---

### 4. Assistant/GM Typed Schema — MEDIUM

**Current state**: `gm_config` stored as raw JSON string, parsed with
`jsonParseOr` on both sides **Risk**: No type safety, fragile parsing, no
validation

*_Tasks_:

- [ ] Define `GmConfig` interface in `src/chat/types.ts` (shared between backend
      and frontend)
- [ ] Add `gmConfig` field to `ChatCreateBody` and `ChatUpdateBody` validation
      schemas (`src/validation/schemas.ts`)
- [ ] Add `visualNovel` field to `ChatCreateBody`/`ChatUpdateBody` and `chats`
      table (migration)
- [ ] Add `turn_strategy` to frontend chat settings UI (`chat-settings.ts`)
- [ ] Replace raw `jsonParseOr<{ assistantRole?: string }>` with typed
      `GmConfig` deserialization

**Epic**: `epic-chat-lifecycle-moderation.md`, `epic-assistant-gm-flows.md`
**Related tickets**: `FEAT-065-template-system.md`, `FEAT-065-sub-llm.md`

---

### 5. SD.CPP / ComfyUI Integration Steps — HIGH (for emotional avatar)

**SD.CPP** (via `sd-server`):

- Config exists in `src/config/schema.ts` (`sd-server` port, spawn toggle, model
  path)
- `src/assistant/sd.ts` has `SDRequest`/`SDResponse` interfaces and
  `SDProviderConfig`
- `src/image-edit/providers/sd-server-provider.ts` exists for SD server
  integration
- `src/generation/image-gen-route.ts` has a working `handleImageGeneration()`
  that uses sd-server for text2img (OpenAI-compatible, SDAPI, sd.cpp families)
- `sdConfig.apiFamily` supports `"openai" | "sdapi" | "sdcpp"` — sd.cpp is the
  default
- **Already wired**: sd-server handles txt2img and img2img via its API;
  `ImageGenBody` already supports `n` (1-4), steps, cfgScale, sampler, seed,
  denoising strength, hires upscale
- **Missing for emotional avatar**: Wire emotion tags into SD prompt generation,
  add `emotion` field to `SDRequest`, register sd-server as an image generation
  provider in the generation provider registry
- **1-shot vs repeat**: sd-server handles this natively via `n` parameter
  (already supports concurrent generations up to 4)
- **Rate limiting**: No rate limiting exists for sd-server/ComfyUI — must be
  added per provider to prevent GPU exhaustion

**ComfyUI** (via `src/generation/providers/comfyui.ts`):

- `ComfyUIClient` exists with `submitWorkflow()` and `pollExecution()`
- `src/image-edit/providers/comfyui-provider.ts` exists for image editing
- **Missing**: Create emotion-avatar workflow template (node graph with emotion
  conditioning), register template in `ComfyUIWorkflow` type, map `EmotionType`
  enum values → ComfyUI node parameters, add `POST /api/admin/comfyui/workflows`
  route for template management

**⚠️ Resource Constraint — Dynamic Backend Selection (Practical Solution)**:

- sd-server (sd.cpp) spawns a new process per generation — no shared memory with
  other processes
- ComfyUI runs as a persistent server (port 8188) consuming significant GPU/RAM
- sd-server and ComfyUI should NOT run simultaneously on the same machine due to
  resource contention
- **Practical solution**: Dynamic backend discovery + selection, not mutual
  exclusion
  - Admin panel configures both backends but marks one as `preferred` per
    category
  - Runtime discovery checks which backends are healthy/available at generation
    time
  - If ComfyUI is busy (queue depth > threshold), fall back to sd-server
  - If sd-server is at capacity (concurrent generations > limit), fall back to
    ComfyUI
  - Each provider has independent rate limiting and concurrency controls
  - sd-cli (if implemented) is a 1-shot fallback — single process, no daemon,
    immediate exit after generation *_Tasks_:

- [ ] Add `emotion` field to `SDRequest` interface in `src/assistant/sd.ts`
- [ ] Register sd-server as image generation provider in
      `src/generation/providers/registry.ts`
- [ ] Create ComfyUI emotion-avatar workflow template in
      `src/generation/providers/comfyui.ts`
- [ ] Add emotion → ComfyUI node parameter mapping
- [ ] Create workflow template registry endpoint
      (`POST /api/admin/comfyui/workflows`)

**Epic**: `epic-comfyui-plugin.md`, `epic-3d-generation.md` **Related tickets**:
`TASK-comfyui-node-discovery.md`, `TASK-comfyui-template-registry.md`,
`FEAT-065-sub-image.md`

---

### 6. LLM/SD Template Injection — MEDIUM

**LLM template injection**: Already implemented via `PromptAssembler`
(`src/assistant/prompt-assembler.ts`) with section-based injection
(`PROMPT_SECTIONS` registry). Each section builds prompt content independently.
The `resolveTemplate()` function in `src/generation/prompt-templates.ts` handles
variable substitution in image generation templates.

**SD template injection**: `src/generation/prompt-templates.ts` has
`resolveTemplate()` for SD prompt templates with tag-based, natural language,
and mixed styles. Templates are per-model and per-detail-level.

**Gap**: The template injection system is functional but:

- No admin UI for managing/customizing templates
- No per-character template overrides
- No template versioning

*_Tasks_:

- [ ] Add template management endpoints to `routes/admin.ts`:
  - `GET /api/admin/templates` — list all templates
  - `PUT /api/admin/templates/:id` — update template
  - `POST /api/admin/templates` — create template
- [ ] Add per-character template override field in `actors` table (migration)
- [ ] Build template management UI in admin panel
      (`src/frontend/alpine/admin.ts`)

**Epic**: `epic-assistant-generation-extensions.md` **Related tickets**:
`FEAT-065-template-system.md`, `TASK-asset-templates.md`

---

### 7. Memory Management & Injection — ALREADY IMPLEMENTED

**Full system exists**:

- `src/memory/injection.ts` — injection logic with privacy levels, comfort
  modifiers, turn cooldowns
- `src/memory/index.ts` — re-exports extraction, budget, purge, provision,
  shareability, injection
- `src/assistant/prompt/sections/memories.ts` — memory section in prompt
  assembler
- `src/chat/memory-injection.ts` — bridges memory system with context window
- `src/assistant/commands/narrate.ts` — `/narrate` command for narration
  injection
- `src/assistant/commands/ooc.ts` — `/ooc` command for OOC injection

*_Tasks_: No action needed — memory injection is fully wired.

---

### 8. Logging for Intensive FExBExDB Debugging — ADEQUATE

**Current state**:

- `src/logger/levels.ts` — numeric levels (DEBUG=10, INFO=20, WARN=30, ERROR=40)
- `src/config/schema.ts` — `LOG_LEVEL` config mapping
- `src/logger/` — structured logging with levels, formatters, censors, rotation,
  queuing
- `src/frontend/alpine/logger.ts` — frontend log forwarding
- `src/routes/frontend-logs.ts` — endpoint for frontend logs

**FExBExDB** (Frontend × Backend × DB) debugging: The logging infrastructure is
sufficient for intensive debugging. The structured logger supports debug-level
verbosity, and the frontend-logs endpoint enables cross-layer tracing.

*_Tasks_: No action needed for logging itself. Consider:

- [ ] Add request ID correlation across frontend→backend→DB for traceability
      (optional enhancement)
- [ ] Add generation pipeline tracing (prompt → LLM response → storage) with
      debug-level logging (optional enhancement)
- [ ] Add rate limiting for SD/image generation providers (max concurrent, queue
      depth, timeout) — prevents GPU exhaustion when multiple emotional avatar
      generations fire simultaneously
- [ ] Add sd-server process lifecycle management — ensure only one sd-server
      instance runs, auto-restart on crash, port conflict detection

---

### 9. Admin Portal — High-Value Features

**Existing admin endpoints** (`routes/admin.ts`):

- `GET /api/admin/providers` — list providers with health status
- `GET /api/admin/providers/:name/models` — list models for a provider
- `POST /api/admin/providers/rescan` — trigger provider re-scan
- `GET /api/admin/model-roles` — get role assignments
- `PUT /api/admin/model-roles/:role` — set role override
- `DELETE /api/admin/model-roles/:role` — clear role override
- `GET /api/admin/sd-status` — SD server status

**Missing high-value admin features**:

- [ ] **LLM provider setup UI** — admin panel for adding/configuring LLM
      providers (endpoint, API key, model selection)
- [ ] **SD/ComfyUI setup UI** — admin panel for configuring SD server endpoint,
      ComfyUI URL, workflow templates
- [ ] **Provider selection for image generation** — admin panel to choose
      sd-server vs ComfyUI per operation, with mutual exclusion awareness (they
      cannot run simultaneously on the same machine)
- [ ] **Rate limiting config** — per-provider concurrent generation limits,
      queue depth, timeout settings
- [ ] **sd-server process management** — start/stop/restart sd-server, ensure
      single instance, auto-restart on crash
- [ ] **Template management UI** — manage prompt templates per model/gen mode
- [ ] **Key management UI** — `/settings/keys` page (listed in crypto spec
      remaining work)
- [ ] **Encryption settings** — toggle encryption, configure SMK, view key
      rotation status
- [ ] **Provider health dashboard** — real-time status with auto-refresh

**Epic**: `epic-tooling-improvement.md`, `epic-observability-telemetry.md`
**Related tickets**: `TASK-encryption-key-management-ui.md`,
`TASK-encryption-key-rotation.md`, `TASK-comfyui-plugin-workflow-templates.md`,
`FEAT-065-sub-image.md`

---

## Fast Review & Hook System (New)

Fast reviews extend functionality by using main/aux LLM on content for triggering
events. All hooks respect privacy and NSFW allowance.

### Hook Architecture

- **Content analysis hooks** — LLM inspects incoming/outgoing content for triggers
- **Mood hooks** — detect mood shifts → fire `POST /api/actors/:id/mood/delta`
- **Emotion hooks** — detect emotional content → trigger avatar selection
- **NSFW hooks** — check content against `nsfw_policy` and `NsfwConfig.allowNsfw`
- **Moderation hooks** — flag content for moderation workflows
- **Privacy gates** — all hooks check NSFW allowance and privacy levels before acting

### Tasks

- [ ] Define hook interface in `src/generation/hooks/` — `HookHandler` with `canHandle(content, context)` and `execute(content, context)`
- [ ] Implement mood hook — LLM detects mood shifts, emits mood delta events
- [ ] Implement emotion hook — LLM detects emotional content, triggers avatar selection
- [ ] Implement NSFW hook — checks content against policy and age gates
- [ ] Implement moderation hook — flags content for review, applies moderation actions
- [ ] Add hook registry — `src/generation/hooks/registry.ts` with ordered hook chain
- [ ] Wire hooks into generation pipeline — `PromptAssembler` calls hooks before/after content generation
- [ ] Add privacy/NSFW guard to each hook — hooks check `NsfwConfig` and user privacy settings
- [ ] Add unit tests for each hook type
- [ ] Add integration tests for hook chain execution

**Epic**: `epic-character-core-system.md` (hooks part of character system)
**Related tickets**: TBD

---

## Test Coverage Plan (New)

Overall coverage needed to confirm FExBExDB harmonization post-merge.

### Migration Tests

- [ ] Test each migration `up()` creates expected tables/columns
- [ ] Test each migration `down()` drops expected tables/columns (where applicable)
- [ ] Test migration `up()` then `down()` roundtrip is idempotent
- [ ] Test `character_arousal` table exists after migration 027 in test DB

### Schema Manifest Tests

- [ ] Verify every DB column has a manifest entry
- [ ] Verify every manifest table has a corresponding DB table
- [ ] Detect `template_overrides` column gap (DB has it, manifest missing)

### Service Layer Tests

- [ ] `MoodService` — test mood delta, emotion tracking, happiness meter
- [ ] `SeductionService` — test arousal tracking, intimacy scores
- [ ] `NsfwConfig` — test policy gating, age verification
- [ ] `PromptAssembler` — test hook injection, template resolution

### Route Handler Tests

- [ ] Test all admin routes return correct responses
- [ ] Test NSFW gating at route level
- [ ] Test mood/emotion API endpoints

### Integration Tests

- [ ] End-to-end: character creation → mood → emotion → NSFW policy
- [ ] End-to-end: template override → prompt assembly → generation
- [ ] End-to-end: hook chain → mood trigger → emotion avatar

---

## Finalization Items

### Required Before "Done"

1. **Run `bun run check`** — typecheck + lint + format + md:lint
2. **Run `bun test src/`** — unit tests
3. **Run `E2E_SAFEGUARD=1 bun test tests/e2e/`** — e2e tests (if affected)
4. **Commit with `agent-commit`** — if changes are made from this plan
5. **Update `.plan/epics.md`** — if new epics are created from this plan
6. **Reconcile all deferred items** (§Reconciliation Status above)

### Optional Enhancements (Lower Priority)

- [ ] Add request ID correlation for FExBExDB traceability
- [ ] Add generation pipeline debug tracing
- [ ] Add `frontend.mode` config + Accept-based content negotiation (per
      code-practices research)
- [ ] Tighten frontend `tsconfig.frontend.json` to match backend strictness
- [ ] Add `eslint-plugin-import` (no-cycle, order) + `no-misused-promises` to
      frontend

---

## Related Epics

| Epic                        | File                                                    | Relevance                             |
| --------------------------- | ------------------------------------------------------- | ------------------------------------- |
| Character Core System       | `.plan/epics/epic-character-core-system.md`             | Mood, emotional avatar, NSFW features |
| ComfyUI Plugin              | `.plan/epics/epic-comfyui-plugin.md`                    | SD/ComfyUI integration                |
| Chat Lifecycle & Moderation | `.plan/epics/epic-chat-lifecycle-moderation.md`         | GM config, visual novel               |
| Assistant GM Flows          | `.plan/epics/epic-assistant-gm-flows.md`                | GM role, assistant integration        |
| Tooling Improvement         | `.plan/epics/epic-tooling-improvement.md`               | Admin portal, template mgmt           |
| Observability & Telemetry   | `.plan/epics/epic-observability-telemetry.md`           | Admin dashboard                       |
| Encryption Foundation       | `.plan/epics/epic-encryption-foundation-aes-256-gcm.md` | Key management UI                     |
| Configuration Extensions    | `.plan/epics/epic-config-extensions.md`                 | LLM/SD config                         |

--- tip: run 'lean-ctx setup' to configure agent rules for optimal AI integration ---
