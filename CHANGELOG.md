# Changelog

All notable changes to loop-lore. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versions per [SemVer](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-08-15

First release. Clean-room reimplementation of SillyTavern-style RPG chat.

### Added

- **Story mode** — per-actor multi-LLM model assignment, GM-guided story orchestration, story-mode chat view (GM panel, quest log, quality badges), pause/resume/step controls, narration injection, quest banners.
- **Chat** — chat service layer (context window, transitions, moderation), message/chat CRUD, WebSocket transport, group chat with mention parsing, enhanced assistant with commands + prompt assembly.
- **RPG subsystems** — combat, quests (consolidated quest engine), skills, loot, stats, dice, morale, world/location states, NPC navigation, world shaping, achievement tracking, item/equipment lifecycle.
- **Characters** — character services (avatar, mood, traits, relationships), character importers, emotion avatars with multi-provider text2img fallback, avatar generation (LoRA).
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

- Dead/unwired code close-out (A8 — LoRA wiring + RPG service consolidation).

### Security

- Actor-scoped access control on RPG routes (`requireActorAccess`); pre-push hook blocks agent pushes (human-attested release pushes).
