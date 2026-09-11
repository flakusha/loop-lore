<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Chat Product Features

**Status:** 🟡 Not Started
**Priority:** High
**Effort:** High
**Type:** Feature Epic
**Tags:** chat, product, ux, crypto, context, memory, turn, moderation, ownership, location, archival, templates, rpg

## Overview

Cross-cutting product feature coverage for the chat surface: rich-message
controls (improve / asset attach), reliable encryption with deterministic
key rotation on membership change, GM-style annotations (notes / shadow
notes / quests / carriage), context + memory + event propagation,
turn/talkativity/skip control, moderation actions (ban / kick / mute),
ownership transfer, location transition with party handoff, archive +
deletion with search filtering, intro-based entity generation with
backpropagation, pre-send entry-field buffer with send-blocking,
RPG rule enforcement, chat-settings templates with compatibility matrix,
RPG location uniqueness, and RPG chronological/tree navigation.

This epic consolidates user-facing feature asks not yet captured under
the existing chat-lifecycle, world-locations, encryption, or RPG wiring
epics. Items 14 and 15 are gated by `epic-rpg-wiring-phase3` and
`TASK-rpg-gate-chat-commands-behind-world-opt-in` (an RPG-mode world
opt-in is required before these surface in the product).

## Tasks

### Component & Message UX (Medium)

- [ ] TASK-chat-feature-component-buttons

### Crypto Reliability (High)

- [ ] TASK-chat-feature-encryption-key-rotation

### GM Annotations (Low)

- [ ] TASK-chat-feature-notes-shadow-carriage

### Context / Memory / Event Propagation (Medium)

- [ ] TASK-chat-feature-context-memory-events

### Turn & Talkativity (Medium)

- [ ] TASK-chat-feature-turn-talkativity-skip

### Moderation (High)

- [ ] TASK-chat-feature-moderation

### Ownership Transfer (High)

- [x] TASK-chat-feature-ownership-transfer

### Location Transition & Party Handoff (Medium)

- [ ] TASK-chat-feature-location-transition-transfer

### Archive / Deletion / Search Filtering (Low)

- [ ] TASK-chat-feature-archive-deletion-search

### Intro-Based Generation & Propagation (High)

- [ ] TASK-chat-feature-introduction-generation-propagation

### Entry Field & Pre-Send Buffer (Low)

- [ ] TASK-chat-feature-entry-field-pre-send

### RPG Rule System (Low)

- [ ] TASK-chat-feature-rpg-rule-system

### Settings Templates & Compatibility Matrix (Medium)

- [ ] TASK-chat-feature-settings-templates-compat-matrix

### RPG Location Uniqueness (Low, RPG-mode gated)

- [ ] TASK-chat-feature-rpg-location-uniqueness

### RPG Chronological / Tree Navigation (Low, RPG-mode gated)

- [ ] TASK-chat-feature-rpg-chronological-navigation

### Continuation & Generation Affordances (Medium)

- [ ] TASK-chat-feature-auto-continue-continuation

### Message History Control (Medium)

- [ ] TASK-chat-feature-message-edit-resubmit-branch

### Sharing & Export (Low)

- [ ] TASK-chat-feature-share-links-export-formats

### Organization & Sub-Conversations (Low)

- [ ] TASK-chat-feature-chat-organization-folders-tags
- [ ] TASK-chat-feature-topics-side-threads

### Scene Production & Rich Content (Medium)

- [ ] TASK-chat-feature-scene-art-generation
- [ ] TASK-chat-feature-chat-artifacts

### Rendering & Format Contract (Medium)

- [ ] TASK-chat-feature-message-formatting-modes
- [ ] TASK-chat-feature-system-format-contract
- [ ] TASK-chat-feature-carriage-visibility-tiers

## Files (Anchor References)

### Component Buttons & Asset Attach

- `src/components/chat/` — message actions + asset picker host
- `src/group-chat/mention-parser.ts` — embedded `@asset` mention shape
- `src/crypto/asset-encryption.ts` — client-side asset envelope

### Encryption & Key Rotation

- `src/crypto/chat-keys.ts`, `src/crypto/key-distribution.ts`
- `src/crypto/key-rotation/rotate.ts`, `src/crypto/key-rotation/auto-run.ts`
- `src/crypto/key-rotation/timer.ts`, `src/crypto/key-rotation/re-encrypt.ts`
- `src/crypto/e2e/group-encrypt-message.ts`
- `src/middleware/idempotency.ts` — debounces overlapping rotations

### Notes / Shadow Notes / Carriage

- `src/chat/proactive/types.ts`, `src/chat/proactive/db-helpers.ts`
- `src/chat/service/carry-history.ts`, `src/chat/service/party-narration.ts`
- `src/memory/shareability.ts` — controls which annotations cross boundaries

### Context / Memory / Event Propagation

- `src/chat/context-window.ts`, `src/chat/context-stats.ts`
- `src/chat/random-events.ts`, `src/chat/proactive/timing.ts`
- `src/memory/injection/decide.ts`, `src/memory/injection/select.ts`
- `src/memory/injection/relevance.ts`
- `src/generation/auto-gen/post-store.ts` — fires injected events
- `src/rag/search/orchestrator.ts` — recall layer for memory

### Turn / Talkativity / Skip

- `src/turning/turn-manager/selection.ts`
- `src/turning/turn-manager/participants.ts`
- `src/turning/turn-strategies.ts`
- `src/group-chat/turn-selector.ts`
- `src/group-chat/index.ts`

### Moderation (ban / kick / mute / NSFW points)

- `src/chat/moderation.ts`, `src/chat/types/moderation.ts`
- `src/middleware/nsfw-gate/access.ts`, `src/middleware/nsfw-gate/consent.ts`
- `src/middleware/nsfw-gate/logging.ts`
- `src/generation/hooks/moderation-hook.ts`
- `src/profanity/service.ts`

### Ownership Transfer

- `src/chat/ownership.ts`
- `src/chat/service/chats.ts`, `src/chat/service/write.ts`
- `src/middleware/auth/`, `src/middleware/permissions.ts`

### Location Transition & Transfer

- `src/chat/transitions.ts`, `src/chat/service/transitions.ts`
- `src/chat/service/carry-location.ts`
- `src/chat/service/party.ts`, `src/chat/service/party-narration.ts`
- `src/chat/types/transitions.ts`
- `src/chat/service/location-events.ts`

### Archive / Deletion / Search Filtering

- `src/chat/service/visibility.ts`
- `src/chat/service/crud/`
- `src/middleware/nsfw-gate/access.ts` — archived-state visibility
- `src/rag/search/quarantine.ts` — keeps archived entries out of recall

### Introduction-Based Generation & Backpropagation

- `src/generation/auto-gen/classify-intent.ts`
- `src/generation/auto-gen/resolve-known-names.ts`
- `src/chat/hallucination-guard/detect.ts` — guards generated entities
- `src/memory/extraction.ts` — backflow into shared memory

### Entry Field Pre-Send Buffer & Send Blocking

- `src/components/chat/` — input surface (browser-side)
- `src/group-chat/mention-parser.ts` — `@mention` validation gate
- `src/turning/turn-manager/state.ts` — turn gate for `send` button

### RPG Rule System

- `src/chat/service/party.ts`, `src/chat/service/party-narration.ts`
- `src/group-chat/turn-selector.ts`
- `src/generation/prompt-templates/profiles.ts` — rule-driven prompts
- `src/generation/prompt-templates/templates.ts`

### Settings Templates & Compatibility Matrix

- `src/chat/setup-templates.test.ts`
- `src/chat/service/templates.ts`, `src/chat/service/template-crud.ts`
- `src/chat/service/template-defaults.ts`
- `src/chat/service/vn-choices.ts`
- `src/chat/types/config.ts`

### RPG Location Uniqueness (gated)

- `src/chat/npc-movement/index.ts`
- `src/chat/service/party.ts`
- `src/chat/proactive/types.ts`

### RPG Chronological / Tree Navigation (gated)

- `src/chat/service/split.ts`, `src/chat/service/split-utils.ts`
- `src/chat/service/carry-history.ts`
- `src/chat/transitions.ts`

## Linked Tasks

- TASK-chat-feature-component-buttons.md
- TASK-chat-feature-encryption-key-rotation.md
- TASK-chat-feature-notes-shadow-carriage.md
- TASK-chat-feature-context-memory-events.md
- TASK-chat-feature-turn-talkativity-skip.md
- TASK-chat-feature-moderation.md
- TASK-chat-feature-ownership-transfer.md
- TASK-chat-feature-location-transition-transfer.md
- TASK-chat-feature-archive-deletion-search.md
- TASK-chat-feature-introduction-generation-propagation.md
- TASK-chat-feature-entry-field-pre-send.md
- TASK-chat-feature-rpg-rule-system.md
- TASK-chat-feature-settings-templates-compat-matrix.md
- TASK-chat-feature-rpg-location-uniqueness.md
- TASK-chat-feature-rpg-chronological-navigation.md
- TASK-chat-feature-auto-continue-continuation.md
- TASK-chat-feature-message-edit-resubmit-branch.md
- TASK-chat-feature-share-links-export-formats.md
- TASK-chat-feature-chat-organization-folders-tags.md
- TASK-chat-feature-topics-side-threads.md
- TASK-chat-feature-scene-art-generation.md
- TASK-chat-feature-chat-artifacts.md
- TASK-chat-feature-message-formatting-modes.md
- TASK-chat-feature-system-format-contract.md
- TASK-chat-feature-carriage-visibility-tiers.md
