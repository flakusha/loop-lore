<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Ollama-native provider drops GenerationMessage.images so filename-only captions persist as alt_text

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

**Summary:**

Evidence (approved finding 6, P2; .tmp/concern-dev-2026-10-07.md, .tmp/concern-federation.md): src/generation/caption-route.ts:138-146 (added in 8e45efca8); drop site src/generation/providers/ollama-native/http.ts:65-71. 8e45efca8 added GenerationMessage.images and taught two of the three text providers to serialize it (anthropic request.ts content blocks, openai-compatible http.ts image_url parts); the first-class ollama-native provider (registry.ts:268-275) buildBody maps messages to {role, content, name?, tool_call_id?, tool_calls?} and silently discards m.images — Ollama's own vision contract images: string[] is never populated. Executed evidence (.tmp/review/repro-ollama.ts): same request through both builders — ollama-native emits {role, content} with NO image data at all; openai-compatible emits the image_url data-URL part. Impact: when the captioning/Main role resolves to an ollama-native-served multimodal model, the caption route reads and base64s the image bytes (vision gate passes: scanned supportsVision or caps===null), then the provider sends a filename-only prompt; the model returns a plausible caption with no image, which is written to assets.alt_text and served as the accessibility caption — wrong output with no error, log, or signal. Fix: map images in ollama-native buildBody (images: m.images.map(i => i.base64)), or make the caption route skip attachments for providers without a vision serializer.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
