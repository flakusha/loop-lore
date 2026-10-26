<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: Wire encryption for generated images

**Status:** Done
**Priority:** high
**Effort:** Medium
**Epic:** epic-encryption-workflow

**Summary:**

Generated images are stored plaintext on disk. createAsset only encrypts when encryptionTier !== 'public' AND chatKey/keyId/pipelineConfig are provided. image-gen-route.ts:166-181 calls createAsset without any encryption params. PersistGeneratedImagesOpts has no encryption fields. All generated images have encryptionTier='public', encryptedKeyId=null. Fix: extend PersistGeneratedImagesOpts with optional encryptionTier/chatKey/keyId/pipelineConfig, pass through to createAsset. Update image-gen-route to accept and forward these.

**Related:** epic-comfyui-first-class-citizen

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-26 registry-driven close: git issue df32ec9 (registry tip: dfe0f9df0 Konstantin Fedotov Close issue)
