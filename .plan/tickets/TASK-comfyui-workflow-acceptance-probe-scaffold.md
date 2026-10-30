<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: ComfyUI workflow acceptance-probe scaffold

**Status:** Done
**Status Note:** Landed on feat-comfyui-param-derivation (owner-verified 2026-10-30): src/generation/comfyui-params/probe.ts + probe-generate.ts (plus probe/probe-generate tests), checklist-fields migration 082_prompt_templates_probe_checklist, validator converted-mode in src/generation/workflow-library/validate.ts, and admin wiring (ui-ingest.ts, create/update routes, seed repair leg).
**Priority:** medium
**Effort:** Medium
**Epic:** epic-comfyui-first-class-citizen
**Tags:** comfyui, workflows, testing, probes

**Summary:**
Generate the acceptance probe for a workflow-library row from the row itself:
a stubbed-ComfyUI fixture test (validates the converted graph against the
object_info snapshot: node classes installed, links resolve, placeholders
substitute to typed values, expected output kind asserted) plus a live-probe
script stub (weights acquisition, min_vram check, named observable to fill
in). AC: for a fixture row, `bun test` runs the generated stubbed probe green
and the row's confirm checklist (probe / params reviewed / license / VRAM
fence) is enforced as row fields, not prose.

**Context:**
epic-video-generation.md requires an acceptance probe per workflow family
("no workflow family ships until its probe is green, the parameter map is
reviewed, and its license/VRAM fence is recorded on the library row"); IVSS
§Workflows and plugins repeats it. Today each probe would be hand-written.

**Acceptance Criteria:**
- [ ] Probe generator: given a library row (API body + params + expected
      output kind), emits a stubbed-ComfyUI test that fails on missing node
      classes, dangling links, unresolved placeholders, or wrong output kind —
      before any submit.
- [ ] Generated tests run in CI against the committed object_info snapshot
      (no live server; no weights download in the stubbed path).
- [ ] Parallel-safe by construction, with the resource contract documented in
      the generator's output header: the stubbed ComfyUI is an in-process fake
      (no listening socket; if a socket is ever needed, port 0/ephemeral —
      never a fixed port); snapshot fixtures are shared READ-ONLY; any files a
      test writes go through the runner's per-test tmp facility with unique
      names (no fixed-path fixtures); teardown in `afterEach`/`finally` so a
      failed test leaks nothing; each test passes alone, in any order, and
      under the default parallel runner (`bun test` parallelizes files). Live
      probes (weights download, real engine) are marked integration,
      serialized/marked — never in the pre-commit verify gate; the stubbed
      suite stays hook-fast (seconds).
- [ ] Live-probe stub: documented script skeleton (weights download with
      license fence check, min_vram probe, observable assertion) committed per
      family on first use.
- [ ] Row confirm-checklist fields exist (probe_status, params_reviewed,
      license, min_vram) and a row failing the gate is visibly disabled in the
      admin list, mirroring `missing_nodes` surfacing.
- [ ] The v-0010-derived fixture row produces a green stubbed probe end-to-end
      (fixture committed).

**Depends on:** TASK-comfyui-parameter-map-derivation-from-marked-workflows.
