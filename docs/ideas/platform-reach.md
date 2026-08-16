<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Platform & Reach

Everywhere-layer ideas. Inspiration: community mobile/offline/backup requests.

## #23 Offline-first PWA + on-device inference

- **Inspiration**: community request
- **What**: Installable PWA that bundles a small local model (e.g. via llama.cpp / Bun)
  for full offline use.
- **Fits**: PWA in roadmap P2 + `docs/spec/integrations/llm-serving.md`.
- **Effort**: High
- **Depends on**: PWA shell, local inference integration

## #24 Mobile-native UX

- **Inspiration**: community request
- **What**: Haptics, swipe gestures, voice input, thumb-friendly layout.
- **Fits**: `docs/frontend/overview.md` responsive design.
- **Effort**: Med
- **Depends on**: responsive components

## #25 Cross-device E2E sync

- **Inspiration**: novel
- **What**: End-to-end-encrypted sync of chats/characters across devices.
- **Fits**: `docs/spec/crypto.md` key hierarchy already designed for this.
- **Effort**: Med
- **Depends on**: crypto.md, sync service

## #26 Multimodal input

- **Inspiration**: SillyTavern multimodal
- **What**: Upload image/voice → character reacts (vision/STT models).
- **Fits**: `docs/spec/assets.md` + provider system.
- **Effort**: Med
- **Depends on**: vision/STT providers
