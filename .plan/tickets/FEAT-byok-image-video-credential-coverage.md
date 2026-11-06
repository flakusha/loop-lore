<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# FEAT: byok-image-video-credential-coverage

**Status:** Done
**Priority:** medium
**Effort:** Medium
**Epic:** epic-byok-api-keys

**Summary:**

Let users store BYOK credentials for hosted image/video backends, not just `openaiCompatible` chat providers. Research findings (2026-11-05 credential pass): `POST /api/user-api-keys` (`src/routes/api-keys.ts`) validates provider names against configured `openaiCompatible` instances only, and `image-gen-route.ts` never consults `user_api_keys` — the image credential is the operator's static `ImageProviderConfig.apiKey` (epic-byok-api-keys ":299-315 The real gap"); video BYOK rows already exist for Kling/Veo per the epic's ":285-288". This closes the epic's Known Gap and absorbs `BUG-byok-store-rejects-non-openaicompatible-provider-names`. Storage/crypto already support it: `user_api_keys` (`src/db/schema-core.ts:227+`, `UNIQUE (user_id, provider_name)` from migration 078, `key_version` from 080) with AES-256-GCM versioned envelopes in `packages/core/src/crypto/byok.ts`. Keep fail-closed decrypt (`ByoKeyDecryptError`) semantics for any new resolution path.

**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Acceptance Criteria:**

- [x] Users can store keys for configured hosted image/video backend providers (`POST /api/user-api-keys` accepts `generation.providers.sd` / `.video` instance names)
- [x] Image/video generation resolves the user's stored key when present; operator key remains the fallback posture consistent with the epic (image gen: image-gen-route; image EDIT: `src/image-edit/credentials.ts` resolveEditApiKey wired through handleRun → `ImageEditExecuteOpts.apiKey` → ComfyUIClient/SDServerHost Bearer header; video: video-gen-route → generateVideoWithFailover)
- [x] `BUG-byok-store-rejects-non-openaicompatible-provider-names` closes (api-keys.ts knownProviders covers every dispatchable instance incl. image/video)
- [x] Fail-closed decrypt errors never fall back to server/operator keys (ByoKeyDecryptError aborts before any backend call; tested in user-api-key.test.ts, video-engine.test.ts, image-engine/index.test.ts, image-edit/credentials.test.ts, image-edit/byok-failclosed.test.ts)

**Context:**

Closed on epic-agentic-integration (2026-11-05). Storage/crypto (`user_api_keys`, `userApiKeyResolver`) were reused unchanged. Final piece: the image-EDIT path now threads the resolver per edit-purpose sd provider instance name (`pickSdProvider(list, "edit")`), honors `allowUserApiKey` (default-allow, explicit false denies), and passes the resolved key as a Bearer credential to the ComfyUI client or sd-server families; a corrupt ciphertext throws `ByoKeyDecryptError` before `provider.execute`, so the operator key is never billed. Also landed in the same slice: operator-authored ComfyUI edit workflows (`ImageProviderConfig.workflow` naming a `configs/workflows/` file, registered as img2img templates via `comfyui-workflow-template.ts`; the graph encodes the model, substitution carries prompt + input image only). The video engine's async-job-shape concerns live in the video epic's own tracking, not this ticket's ACs — ticket closed.
