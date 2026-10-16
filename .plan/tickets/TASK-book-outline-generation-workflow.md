<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Text-Only Book Generation Workflow (Outline → Chapters)

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-narrative-publishing-workflows
**Related:** `TASK-publication-artifact-schema.md`, `TASK-book-unit-editor-review-surface.md`, `TASK-illustrated-book-reference-pass.md`, `epic-assistant-creative-studio-workflows.md`, `epic-assistant-gm-flows.md`
**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

The text-only book tier, end to end: a `book-outline` workflow template authored
in YAML against the existing schema, plus the runner wiring that turns a
confirmed run into a `publications` row with ordered `publication_units`.

## Context

This is an **instantiation of the existing harness**, not a new one. The
template schema is `AssistantWorkflowConfig` in
`src/config/sections/templates-workflow.ts:61` — `intent`, `triggers`,
`steps[]`, `dispatch`, `approval` — and the on-disk shape is demonstrated by
`configs/templates/workflows/entities.yaml` (a `merge: extend` file with a
`workflows:` map and `entityType` cross-referencing `entity-types.yaml`). The
loader discovers every file in `configs/templates/workflows/`
(`src/config/templates-loader/discovery.ts`), so adding a file is the whole
registration step.

The runner (`src/assistant/workflow-runner.ts`) is a pure state machine —
`startWorkflow` → `previewSteps` → `buildStep` → confirm → `WorkflowDispatch` —
and deliberately performs no I/O. Persisting the confirmed run into publication
units is the missing half: a handler beside `src/assistant/commands/workflow.ts`
that takes a confirmed `book-outline` dispatch and writes the artifact. Route
surface follows the existing command mount at `src/routes/messages/command.ts`.

Intent routing is **not** free, and this ticket owns making it work. Declaring
`intent: { type: generate, target: book }` is not sufficient:

- `INTENT_PATTERNS` in `src/regex/intent.ts:19` declares exactly eight `generate`
targets today — `character`, `item`, `location`, `world`, `npc`, `species`,
  `image`, `quest`. There is **no `book` entry**, so no phrasing currently produces
  the target `book`.
- `matchWorkflowIntent` (`src/assistant/workflow-routing.ts:94`) can only return a
  registered target: it picks the best-matching `INTENT_PATTERNS` group, then
  returns `routed.find((w) => w.intent?.target === best.target)` (`:114`). With no
  `book` group, `best.target` can never be `book` and the template is unreachable
  by intent.

So this ticket adds a `book` entry to `INTENT_PATTERNS` (patterns such as
`/write.*book/i`, `/draft.*novel/i`, `/book.*chapter/i`) alongside the `book-outline`
template, and covers the pair in the routing test. Until that lands, only the literal
`triggers` list routes to the template via `matchWorkflowTrigger`. Do not add a new
`AssistantIntent` value — the taxonomy is `generate`, and only the target is new.

Two corrections the implementer must respect:

- **Quality gates do not live on `approval`.** `WorkflowApprovalConfig` is
  `{ type: "confirm" | "auto"; preview?: boolean }`
  (`src/config/sections/templates-workflow.ts:55-58`). Gates are declared on
  `EntityTypePreset.qualityGates` in `entity-types.yaml` and validated against
  `ENTITY_QUALITY_GATES` (`src/config/sections/templates-workflow.ts:82`) by
  `validateEntityTypeConfig` (`src/config/templates-loader/validation-entity-types.ts`).
  The §7.1 example in the workflow epic shows `approval.quality_gates`; that
  shape is not in the landed type.
- **`entityType` is for entity kinds.** It keys into
  `WorkflowTemplateConfig.entityTypes` and a publication is not a character /
  NPC / location / item. The book preset needs its own cross-validation entry
  rather than piggybacking on an entity kind — or the preset is omitted and
  gates run unconditionally at the confirm step. Either is acceptable; silently
  reusing `entityType: character` is not.

Generation reuses the existing quality scorer set
(`src/story/quality-evaluator.ts`, `src/story/quality/scorers/*.ts`) rather than
new prose scorers. Note that `src/story/book-compiler.ts` does **not** exist —
it is the deferred Tier 3 task in `epic-creative-studio.md`; the
outline→chapter generation this ticket builds is a different thing and must not
wait on it.

## Acceptance Criteria

- [ ] `configs/templates/workflows/book-outline.yaml` exists with `merge: extend`
      and a `book-outline` workflow declaring `intent` (`type: generate`),
      `triggers`, and ordered `steps` covering premise → arc → chapter list →
      chapter prose
- [ ] Every `step` validates against `WorkflowStepConfig` (`src/config/sections/templates-workflow.ts:22`)
      — `id`, `name`, `type`, `formatTemplate`, and `required` set deliberately;
      the loader accepts the file with no validation error
- [ ] A matching preset is added to `configs/templates/workflows/entity-types.yaml`
      (or the preset is explicitly omitted with the gates run unconditionally at
      confirm) — `entityType` is not repurposed to a non-entity kind
- [ ] A `book` entry is added to `INTENT_PATTERNS` (`src/regex/intent.ts`) and `matchWorkflowIntent` reaches `book-outline` for an imperative generation message matching that group, covered by a test in `src/assistant/workflow-routing.test.ts`. Until this AC is met, `matchWorkflowIntent` provably cannot return the template (see ## Context)
- [ ] `src/assistant/publication-book.ts` converts a confirmed `book-outline`
      dispatch into one `publications` row (`kind: "book"`) plus ordered
      `publication_units` rows, using the repository layer from
      `TASK-publication-artifact-schema.md`
- [ ] Chapter units land in outline order with dense `position` values; a chapter
      the user skipped (an optional step) is not persisted as an empty unit
- [ ] The command route is mounted alongside the existing workflow command
      handler at `src/routes/messages/command.ts`
- [ ] Nothing is persisted until the run is confirmed — the same
      preview-then-confirm contract `src/routes/messages/create-entity-confirm.ts`
      already enforces for `/create`
- [ ] Unit tests cover: full run → N ordered units; partial run → only the
      confirmed chapters; a chapter that regenerates replaces its unit body
      without disturbing sibling positions