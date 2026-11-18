<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: ComfyUI node ownership boundary

**Status:** Not Started
**Priority:** low
**Effort:** Small
**Epic:** epic-comfyui-first-class-citizen
**Tags:** comfyui, deferred
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**
Keep custom ComfyUI node/plugin development out of loop-lore; revisit only if no pinnable upstream pack can express a required workflow.

**Context:**
Deferred from the 2026-11-19 MiniMax H3 video workflow research (research doc §6, §8.2, §11.9). Node code lives in the `../comfyui` soft fork and its manifest; a hand-edited plugin is wiped or invalidated by update/sync, and loop-lore writing into `custom_nodes/` breaks instance ownership. The existing workflow contract (JSON + `{{var}}` + required-node declaration, validated at admin ingest) is the supported seam. Revisit only when an upstream pack is unavailable or its license is unacceptable.

**Acceptance Criteria:**

- [ ] Decision recorded: workflow JSON is versioned data in loop-lore; node code stays in the fork with a pinned ref.
- [ ] Trigger for owning node code named explicitly (missing capability + license + maintenance evidence).
- [ ] If ever adopted, patch provenance and update-sync behavior documented before the first node is written.

**Related:**

- `.tmp/research/minimax-h3-video-workflow-2026-11-18.md` §6, §7
- `.tmp/research/comfyui-workflows/README.md:41-55`
- `epic-comfyui-first-class-citizen.md`
- `epic-external-creative-tool-bridge.md`
