<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: HuggingFace model download into ComfyUI folders with verify

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-model-rankings-history
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Phase 2 of model download entry (research: .tmp/research/comfyui-workflows/model-download-entry.md). URL + size + sha256 manifest (same contract as browser LocalModelFile) with Range-resume into models/`<family>`/, folder-key validation, license-quarantine handling (UniRig GPL-3.0 precedent). Depends on Ollama pull-through ticket for the fit-verdict + capabilities pattern. Out of scope: auto-download, browser-server model sharing.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
