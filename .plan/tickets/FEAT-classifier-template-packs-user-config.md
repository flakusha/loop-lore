<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# FEAT: classifier template packs user config

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** classifier-template-packs
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Phase 2 of `epic-classifier-template-packs.md`: a user-supplied multi-file
classifier-template domain `configs/templates/classifiers/*.yaml`, following
the `configs/templates/workflows/*.yaml` multi-file precedent (all matching
files returned, user files layer over shipped ones by id, per-file
`merge: extend|replace|override`), plus a `ClassTemplateIndex` /
`selectClassTemplate` selection layer with precedence pack >
`systemPrompts.<purpose>` override > code default. Ships a
`configs/templates/classifiers/pacing.example.yaml` reference example.

**Context:**

`TEMPLATE_FILES` (`src/config/templates-loader/discovery.ts`) lists only the
single-file domains `llm|sd|avatar|image-edit|character` — a new multi-file
domain needs its own discovery path (`findClassifierFiles`), like workflows
got. Validation must follow templates-loader conventions: hand-rolled
validators that throw on bad shapes (`classifiers` must be an object,
`template` must be a string, `serves[]` must be a known AuxTaskName) plus
Levenshtein-distance typo warnings, a schema-class JSON-schema entry, and
wiring at config load — not TypeBox/Zod/Elysia `t` (HTTP bodies only).
Pack entry shape: `id`, `name`, `description`, `serves[]`, `tags[]`,
optional `when` guards, `priority`, `params`, `labels[]`, `template`.
Selection: `serves` includes the task AND all `when` guards hold AND pack
tags ⊆ query tags — where the query tags are the **chat-active subset ∪
actor-trait automatic tags**, each validated against the admin-curated
vocabulary (decided layered tag authority, see below); highest priority
wins; null → fall through to the
existing single-prompt override (back-compat preserved).

Tag authority — **decided (owner, 2026-10-23): variant (d) layered**.
The admin config curates the tag vocabulary; per-chat settings pick the
active subset; actor traits contribute an automatic, read-only context
layer (it can enable packs, never restrict them). Selection query tags
are therefore: **chat-active subset ∪ actor-trait automatic tags**, each
validated against the admin vocabulary; the winning pack's selection log
records which layer supplied each matched tag.

Open questions for the owner (do not resolve unilaterally):
- Same-task competition: first-match-by-priority (proposed) vs merge of
  multiple matching templates?

**Caveats:**

- **Dead-config trap (audit lesson)**: declared-but-unread keys are a known
  failure mode (`target_roles`/`loadouts` on character templates). Every
  pack key must name its runtime consumer in the same change — `params`,
  `when`, `labels` included.
- **Hot-reload classification**: new config path must be classified in
  `classifyConfigPath` (hot / restart / none) and added to the consumers
  registry, or pack edits silently do nothing until restart.
- **Discovery drift**: `*.example.*` files are documentation-only (audit
  convention); the loader must skip them or the example ships as live
  config for every install.
- **TOCTOU between load and selection**: packs load at config-load time;
  selection runs per call. A hot-reload swapping packs mid-call must yield
  either old or new template wholesale, not a mixed parse.
- **Rollback**: additive config domain with empty defaults
  (`TEMPLATES_DEFAULTS.classifiers = {}`); rollback reverts cleanly with no
  data migration.

**Acceptance Criteria:**

- [ ] `findClassifierFiles` + classifiers merge/validation modules exist,
      cloned from the workflows/llm patterns; load-time validation throws
      on invalid shapes with Levenshtein typo hints
- [ ] schema-class JSON-schema entry added; `TemplatesConfig.classifiers`
      section with empty defaults; hot-reload path classified
- [ ] `ClassTemplateIndex` + `selectClassTemplate` implement the pack >
      override > default precedence; no match falls through to
      `resolveSystemPrompt`
- [ ] `configs/templates/classifiers/pacing.example.yaml` ships as the
      documented reference example and is excluded from live loading
- [ ] Layered tag authority implemented: admin vocabulary config,
      per-chat active subset, read-only actor-trait automatic layer,
      vocabulary validation of query tags, and selection logging that
      records which layer supplied each matched tag
- [ ] At least one classifier module consumes `selectClassTemplate`
      end-to-end (no dead config keys)
