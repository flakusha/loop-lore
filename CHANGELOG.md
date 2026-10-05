<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Changelog

All notable changes to loop-lore. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versions per [SemVer](https://semver.org/).

## [Unreleased]

### Added

- **Plugin UI mount points (FEAT-050)** — `GET /api/plugins/ui-components` (admin) lists registered UI components with an optional `?location=` filter. Web-capable components (`type` `web`/`both`) mount as inert host containers carrying `data-plugin-component` / `data-plugin-location` and HTML-escaped `props` JSON into `chat.header` / `chat.sidebar` / `chat.composer` (`src/views/chat.html`) and `admin.dashboard` (`src/views/admin.html`); TUI-only components are never mounted into web views.

- **Wardrobe / loadout avatar variants** — outfit-scoped character appearance layered onto emotion selection: migration `031_wardrobe.ts` (`wardrobe_items`, `actor_wardrobe` bindings, `chat_wardrobe_overrides`, `character_avatars.outfit_id`, `world_avatar_config.outfit_bindings`), selection ladder v2 (chat override > location rule > flag-gated equipped-loadout bridge > character default, then (outfit,emotion) → (outfit,neutral) → (default,emotion) → base), wardrobe CRUD + per-outfit avatar generation routes (`/api/v1/actors/:id/wardrobe[...]`, `/api/v1/chats/:id/wardrobe-override/...`) with central TypeBox validation and owner/participant auth, outfit-change immersion-gate seam (`requestOutfitChange`; NPC/world-rule bypass), `outfitContext` prompt section, character-sheet wardrobe manager panel (outfit CRUD + variant grid grouped by outfit × emotion) and chat-header outfit switcher, and a default-off `system_config.wardrobe_loadout_bridge` flag that lets equipped inventory bindings auto-select the outfit at resolve time (read-side only — no equip-time writes).
- **Chat archival workflow** — `archive_retention_days` admin setting (default 90) with admin route, daily GC sweep (`src/gc/archive-expiration.ts`) registered on cron `0 3 * * *`, asset-cascade via new `asset_links.archived_at` column + migration `017_asset_links_archived_at.ts`, purge route `DELETE /api/chats/:id/purge`, archived-chats filter in list/get queries, soft-link/unlink asset helpers, and `chat.archived` / `chat.unarchived` / `chat.purged` plugin events.
- **Assistant tooling (D3/P2-C)** — `/rewrite` and `/translate` (`/tl`) commands with style/language parsing, expanded command palette entries, multi-step creation wizard (edit → options → review), command button toolbar with GM-role filtering, ownership indicator badge on user-authored messages.
- **Shared interaction ledger** — dice-backed game interactions now persist roll math, ability and relationship modifiers, successful/failed/blocked outcomes, and state changes in `interaction_logs`; social reference commands update canonical character relationships and feed recent-interaction prompt context.
- **Actor autonomy — story auto-drive scheduler** — `AutonomyScheduler` (`src/autonomy/scheduler/`) drives the world-tick loop: `tickOnce(nowMs)` selects due worlds, dispatches each through the existing `runNpcMovementTick` pipeline (no new dispatch path), and commits the per-world cursor from the resolved `AutonomyConfig.tickIntervalMs`. `pause(worldId)` / `resume(worldId)` / `stepOnce(worldId)` / `stateFor(worldId)` give ops human-in-loop control. Due-world ordering is `(next_tick_at ASC, world_id ASC)` — total and restart-stable, since `world_id` is unique. Cursor, pause flag, tick count and last error persist in the new `world_simulation_state` table (migration `023_world_simulation_state.ts`); the cursor write is the commit point, so a crash replays at most one world tick. Telemetry: `scheduler.world_tick.started` / `.completed` / `.error` with the world/payload envelope. Cadence is the caller's job — real-time, accelerated and manual sources all reduce to repeated `tickOnce`; the `giwt sim` CLI is a separate ticket.

### Changed

- **Provider retry deduplication (Effect v4, per-surface adoption)** — the three byte-identical backoff loops in the Anthropic, Ollama-native and OpenAI-compatible HTTP clients now share one policy in `src/generation/providers/retry.ts`, built on `Effect.retry` + `Schedule` from `effect@4.0.0-rc.117` (pinned exactly). Attempt count, delay sequence, retryability filter, abort/timeout classification and the surfaced error identity are unchanged; the triplicated loop bodies are gone.
- **jscpd ratchet gate** — the advisory "N clones" warning is a blocking `jscpd ratchet` check again: the clone count is compared against a committed baseline (`scripts/check/jscpd-baseline.json`) and growth fails the gate; `--update` lowers the baseline only. Restored after a carry-over fold silently reverted the new gate three days after it landed (BUG-jscpd-ratchet-gate-silently-removed-without-ticket).
- **DB v0 collapse** — replaced 23 forward migrations + 20 `parts/` sub-modules with a single atomic `001_init.ts` (~4 600 lines, all 154 tables + indexes + triggers). Dropped `parts/` orchestration, the `parts/`-vs-append strategy policy, the `schema_version` ledger, and the boot-time `schema-backfill` step. Regenerated `schema.ts`, `schema-*.ts`, `schema-manifest.ts`, `insert-helpers.ts`, `db-schemas.ts`. AGENTS.md updated: append-only policy retained, but with only two valid paths (new top-level `NNN_*.ts` or extend current HEAD if not yet shipped).

- **Repo orchestration synced to the pinned `giwt`** — `scripts/worktree/commands/sync.ts` spawned a bare `giwt` off PATH, which resolves through `~/.local/bin/giwt` to a _mutable local checkout_ rather than the `bun.lock` pin; it now resolves the pinned `node_modules/giwt/src/cli.ts` (`giwtArgv`, with tests). `plan:backlog:sync{,fix}` call the dedicated `giwt backlog sync` instead of routing through `giwt plan validate --gates backlog`; new `plan:matrix{,check}` scripts and a `plan - matrix` freshness gate cover the generated `.plan/feature-matrix.md`. AGENTS.md documents the pin rule, the `status-vocab` gate's canonical `**Status:**` values, and the `matrix`/`status-vocab` gates.

### Fixed

- **Emotion-avatar batch fan-out bounded** — `POST /api/v1/actors/:actorId/emotion-avatars` validated `emotions` only for enum membership, so one request could carry an uncapped, duplicate-bearing list and enqueue one image-gen job per entry inside the shared `default` rate bucket (300/min). Arrays longer than the emotion catalogue (18) or holding duplicates now return 400, and a suffix rule routes the `…/emotion-avatars` generation POSTs (character + wardrobe) to the `generation` policy (20/min, burst 5); the job list/status/cancel paths stay on `default` so progress polling is not starved.

- **E2E test safeguard (developer scripts)** — `test:e2e`, `test:e2e:browser`, `test:e2e:smoke`, and `test:all` now export `E2E_SAFEGUARD=1`, disabling the governance rate-limit guard when run directly (matches the behavior already in `ci`, `test:coverage`, and `check-parallel.mjs`). In `test:all` each e2e-reaching command carries its own prefix rather than one chain-wide prefix: `VAR=x cmd1 && cmd2` binds the assignment to `cmd1` alone, so a single prefix left the bare `bun test` running the whole suite with the variable unset — the exact 429 cascade the guard is meant to avoid.

- **Non-retryable provider errors keep their identity when the request is cancelled** — `withProviderRetry` classified an aborted signal before checking whether the failure was already a non-retryable `ProviderError`, so a 401 raised in the same tick as a user cancel surfaced as `Request cancelled` (no status) instead of the auth error. `callWithFailover` maps the two down different paths, which would have swallowed auth failures. Precedence now matches the hand-rolled loops these call sites replaced, and `retry.test.ts` pins it.

## [0.1.0] - 2026-08-15

First release. Clean-room reimplementation of SillyTavern-style RPG chat.

### Added

- **Story mode** — per-actor multi-LLM model assignment, GM-guided story orchestration, story-mode chat view (GM panel, quest log, quality badges), pause/resume/step controls, narration injection, quest banners.
- **Chat** — chat service layer (context window, transitions, moderation), message/chat CRUD, WebSocket transport, group chat with mention parsing, enhanced assistant with commands + prompt assembly.
- **RPG subsystems** — combat, quests (consolidated quest engine), skills, loot, stats, dice, morale, world/location states, NPC navigation, world shaping, achievement tracking, item/equipment lifecycle, crafting stations (definitions + instances CRUD), crafting execution (`POST /craft`), crafting orders (place/accept/fulfill/cancel with payment), combat equipment durability degradation.
- **Characters** — character services (avatar, mood, traits, relationships), character importers, emotion avatars with multi-provider text2img fallback, avatar generation (LoRA), LoRA discovery + application routes wired (`POST /api/lora/discover`, `GET /api/lora/list`).
- **Memory** — memory budget, provisioning, purge, decay; memory selection UI with pinning, injection, assistant/world tabs.
- **Assets** — polymorphic asset linking (images/audio/video), metadata extraction, image editing pipeline.
- **UI** — blessed TUI + htmx/Alpine.js web UI, VN scene generation with choice cards, i18n (server + frontend), persona service, notifications.
- **Regex extraction pipeline** — image edits, intents, memory, transitions, and other extraction passes.
- **Auth & safety** — authentication + sessions, NSFW gate + moderation, profanity filter, age gate, rate limiting, solo-user mode.
- **Plumbing** — Kysely + `bun:sqlite` (PG dialect-swappable), encrypted DB backup/recovery, plugin system, structured logging, telemetry, auxiliary LLM pipeline, wiring gate (`scripts/check-wiring.ts`), e2e browser suite (19 flows).

### Changed

- Lint debt resolved across `src` (156 files), eslint config + example configs shipped.
- In-range dependency bumps (kysely, smol-toml, js-yaml, alpine, eslint, unicorn, typescript-eslint, etc.).

### Fixed

- `versionRedirect` double-prefix loop for `/api/v1/*` paths.
- Browser e2e stabilization across 18 flows (timeout hardening, template-literal lint drift).

### Removed

### Security

- Actor-scoped access control on RPG routes (`requireActorAccess`); pre-push hook blocks agent pushes (human-attested release pushes).
