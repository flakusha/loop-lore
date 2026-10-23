<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: Workflow library img2img row has unresolved placeholders

**Status:** Done
**Priority:** high
**Effort:** Small
**Epic:** epic-comfyui-plugin
**Caveats:** TOCTOU: none — the row is read at build time. Security: none — the parameters are a static list. Authorization: none — the workflow library is an operator surface. Parallelism: none. Lock/unlock lifecycle: none. Partial failure: the library row must stay usable when the builtin TS template is absent. Rollback: revert the seed change and re-seed. Stale state: an already-seeded DB row keeps its broken parameters until it is re-seeded — the fix must include the re-seed path, not only the seed source. Data races: none. Idempotency: re-seeding converges on the same row. Observability: the build error names the workflow and the unresolved placeholder.

**Summary:**

The seeded img2img workflow row declares parameters: [] while its body still carries {{input_image}} and other placeholders, so buildWorkflowGraph throws 'workflow has unresolved placeholders'. The seeded row wins the id collision over the builtin TS template, so the library entry can never be built.

**Context:**

`configs/workflows/img2img.json` is seeded into the workflow library, and the
seeded DB row **wins the id collision** over the builtin TS template
(`src/generation/workflow-library/hydrate.ts:42-45`). The seeded row declares
`parameters: []` (`src/generation/workflow-library/seed.ts:118`) while its body
still carries `{{input_image}}` and other placeholders — so `buildWorkflowGraph`
throws "workflow has unresolved placeholders"
(`src/generation/workflow-library/row.ts:93-99`).

Consequence: the library entry for img2img can never be built. The img2img rung
of `epic-reactive-actor-appearance` (and the img2img work under
`epic-comfyui-plugin`) is blocked on it — the epic attributed that blockage only
to the ComfyUI prerequisites, but this is an independent defect.

Alternative considered: let the builtin template win the id collision. Rejected
for now — the seeded row is the operator-editable copy and is expected to be
the source of truth; the defect is that its declared parameters do not match its
body. (A follow-up may revisit the collision rule.)

**Acceptance Criteria:**

- [ ] Building the seeded img2img workflow succeeds — no "unresolved
      placeholders" throw.
- [ ] The seeded row's declared parameters match the placeholders in its body.
- [ ] The seeded row's parameters and the builtin template's parameters do not
      drift (a test pins the equality).
- [ ] An already-seeded database is repaired by the documented re-seed path.
- [ ] Tests passing; `bun run typecheck` and `bun run lint` clean.

**Resolved:** 2026-10-23 registry-driven close: git issue 15c0f40 (registry tip: ad673e8f7 Konstantin Fedotov Auto-closed: appended .md marker marks BUG-WORKFLOW-LIBRARY-IMG2IMG-ROW)
