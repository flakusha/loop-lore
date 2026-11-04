<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: model + node hardening: pickle scan, ComfyUI node pin, Blender autoexec-off

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-security-sandboxing
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Threat-mitigation notes from .tmp/research/external-brains/08-sandboxing.md (notes only, posture unchanged). (1) Model downloads: prefer safetensors; pre-load pickle scan + provenance pin (HF pickle docs); PickleBall-style callable allowlist for legacy files (CVE-2026-68771 precedent). (2) ComfyUI: pin + review custom-node set per registry standards; keep loopback bind; treat manager remote-install as RCE vector (ComfyUI-Manager#3440). (3) Blender subprocess: untrusted blends open with autoexec off; headless under dedicated uid + no-net + timeout (bpy has no in-process sandbox). Open proportionate-next-step question: bubblewrap-around-subprocess (Blender, trainers) + in-process guard for assistant tools; per-call Firecracker likely too heavy for single-user self-host.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
