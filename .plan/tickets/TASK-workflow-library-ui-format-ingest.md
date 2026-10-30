<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Workflow library UI-format ingest

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Epic:** epic-comfyui-first-class-citizen
**Tags:** comfyui, workflows, admin, converter

**Summary:**
The library ingest path (admin create + `configs/workflows/uploads/` seed)
accepts UI-format workflow JSON as a first-class input: convert → derive
params → store the API-format body + params as the row. The operator drops
ONE file (the editor save); no hand-authored API export. AC: uploading the
v-0010 UI-format JSON creates a runnable row (params derived, gate fields
staged), and an API-format upload keeps today's behavior unchanged.

**Context:**
Phase 1 ingest accepts "a bare ComfyUI export, a wrapper, or the library
payload shape" — but only API-format bodies actually work, so operators must
run the editor export themselves. With the converter + derivation landed,
UI-format becomes the single source of truth (IVSS decision 12a seam).

**Acceptance Criteria:**
- [ ] Format sniffing: UI-format (has `nodes` array + `links`) vs API-format
      (node-id map with `class_type`) detected explicitly; ambiguity is a 400
      naming both, never a guess.
- [ ] UI-format path: converter → parameter derivation → row stored with the
      API body inline (existing payload shape); converter report surfaced in
      the admin response.
- [ ] API-format path: byte-identical behavior to today (regression test).
- [ ] A workflow whose conversion fails is rejected at ingest with the
      converter's named error — nothing partial is stored.
- [ ] Seed dir: UI-format files in `configs/workflows/uploads/` seed through
      the same path on first boot (INSERT-IF-ABSENT, DB wins after).

**Depends on:** TASK-comfyui-parameter-map-derivation-from-marked-workflows, TASK-ui-api-workflow-converter.
