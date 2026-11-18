<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Fence 3D workflow node licenses

**Status:** Not Started
**Priority:** high
**Effort:** Small
**Epic:** epic-3d-generation
**Tags:** 3d, license, comfyui

**Summary:**
Verify and fence the ComfyUI softfork's 3D node packs before any mesh workflow becomes a default. Verified 2026-11-18: `custom_nodes/ComfyUI-GGUF/nodes/{triposg,trellis2}.py` headers are Apache-2.0 (the 11-02 note's "MIT" label is wrong); `vendor/unirig/LICENSE` is GPL-3.0; Zero123++ weights carry CC-BY-NC; Hunyuan3D-2.1 stays gated by the Tencent community licence (upstream issue #254). `vendor/{triposg,trellis2}` carries no sidecar LICENSE — obtain it from upstream before bundling.

**Scope:**

- Record the licence for every node pack and weight set a shipped mesh workflow touches; link the record from `epic-3d-generation` and the workflow catalogue.
- Default workflows may use only Apache/MIT nodes. UniRig (GPL-3.0) is quarantined: never vendored into loop-lore, never a default; the OSS Rigify path stays the rigging default.
- Zero123++ weights and Hunyuan3D-2.1 are flag-gated; each refuses to load without explicit operator opt-in and a licence acknowledgement.
- Add a catalogue test that rejects a default workflow referencing a gated node.

**Evidence:** `.tmp/research/blender-fullcycle-production-editing-2026-11-18.md` §1.1, §5, §6 (softfork paths and headers verified 2026-11-18).

**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability. Licence terms are external: re-verify at each node-pack pin bump. A missing sidecar LICENSE blocks bundling.

**Acceptance Criteria:**

- [ ] Licence inventory recorded for triposg, trellis2, unirig, Zero123++ and Hunyuan3D-2.1 with source citations
- [ ] Default workflow set contains no GPL/NC/Tencent-gated nodes; opt-in flags work
- [ ] Sidecar LICENSE obtained or bundling explicitly blocked for `vendor/{triposg,trellis2}`
- [ ] Catalogue gate test passes

**Context:**

Follows `.tmp/research/blender-fullcycle-production-editing-2026-11-18.md` (2026-11-18). The softfork already carries the inference nodes; the unresolved risk is licence provenance, not model capability. Local-first policy does not relax licence gates.
