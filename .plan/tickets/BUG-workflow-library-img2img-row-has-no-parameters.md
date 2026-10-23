<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Workflow library img2img row has no parameters

**Status:** Not Started
**Priority:** critical
**Effort:** Small
**Epic:** epic-reactive-actor-appearance
**Tags:** workflow
**Caveats:** TOCTOU: the seed reads the file then inserts the row — a concurrent operator edit of that row between the two must win, so the seed must never overwrite a row that already exists. Security: none new (the seed copies an operator-shipped file; parameter names carry no secrets). Authorization: seeded rows stay owned by the resolved admin owner, and the DB copy remains the operator-editable authoritative version. Parallelism: two processes booting at once must not double-import the same file or race on the same id — and the mandated tests must themselves be parallel-safe, since the canonical gate runs `bun test --parallel=4 --isolate` (`package.json:53,55`): each test owns its own in-memory DB (`createTestDb`), its own temp dir, its own `TemplateRegistry`, and resets the seed/hydration module globals, with teardown in `afterAll`/`finally` so a failed case cannot poison the rest. Lock/unlock lifecycle: none. Partial failure: a file whose placeholders cannot be mapped must be skipped with a logged reason, never abort the whole seed. Rollback: reverting the seed fix leaves already-seeded rows untouched — no migration, no destructive rewrite. Stale state: a row seeded before the fix keeps its empty parameter list until it is re-imported, so the repair path is documented rather than automatic. Data races: the check-then-insert of a library row must be safe under concurrent boots. Idempotency: a re-seed imports nothing new and never clobbers an operator-edited row. Observability: the seed outcome must name each skipped file and its reason so a refused import is visible in the log.

**Summary:**

The img2img workflow file is seeded into the workflow library with an EMPTY
parameter list while its body still carries eight `{{placeholders}}`, and the
library row deliberately wins the id collision over the built-in TypeScript
template. `buildWorkflowGraph` therefore throws "workflow has unresolved
placeholders" the first time that row is run, so the image-edit/img2img path
cannot run on a database where that file was imported. The seeded row also
shadows the working built-in `img2img` template, so this is a regression
against a path that used to work, not merely a missing feature.

**Context:**

1. **The workflow file's body carries eight placeholders.**
   `configs/workflows/img2img.json` — `{{prompt}}` (`:11`), `{{negative_prompt}}`
   (`:19`), `{{input_image}}` (`:27`), `{{seed}}` (`:42`), `{{steps}}` (`:43`),
   `{{cfg_scale}}` (`:44`), `{{sampler}}` (`:45`), `{{denoise_strength}}` (`:47`).
   The sibling file `configs/workflows/txt2img.json` has the same shape
   (`{{prompt}}` `:11`, `{{negative_prompt}}` `:19`, `{{width}}` `:27`,
   `{{height}}` `:28`, `{{seed}}` `:36`, `{{steps}}` `:37`, `{{cfg_scale}}`
   `:38`, `{{sampler}}` `:39`), so the defect is generic to the seed, not
   specific to img2img.
2. **The seeded row declares no parameters at all.**
   `src/generation/workflow-library/seed.ts:118` — the payload built by
   `readPayload` hardcodes `parameters: []` and `requiredNodes: []` (`:119`).
   The comment above it (`:97-98`) states the intent: "the
   category/parameters/requiredNodes metadata is library metadata the operator
   edits in the UI".
3. **Validation does not catch the mismatch.**
   `src/generation/workflow-library/validate.ts:67-87` (`parameterErrors`)
   only checks the *declared* parameters direction — that every declared name
   appears as a placeholder. There is no check that every placeholder in the
   body is declared, so a payload with eight placeholders and zero parameters
   validates clean (`:169`).
4. **The library row wins the id collision over the built-in TS template.**
   The seed names the row after the file (`src/generation/workflow-library/seed.ts:156`
   → id `img2img`), and the built-in TypeScript template carries the same id
   (`src/image-edit/templates/builtin/img2img.ts:15`). The hydrate contract
   is explicit: "A library row **intentionally wins an id collision** with a
   built-in TypeScript template: the DB copy is the one the operator edits"
   (`src/generation/workflow-library/hydrate.ts:41-45`), implemented by
   `registry.replaceManaged` overwriting the id
   (`src/image-edit/template-registry.ts:60-70`, rationale at `:53-56`).
5. **The winning row then throws when built.**
   `src/generation/workflow-library/row.ts:93-99` — `buildWorkflowGraph`
   resolves the needed set from the *body* and throws
   `workflow has unresolved placeholders: …` when `payload.parameters.length === 0`
   and a placeholder is missing. The guard is correct; the metadata above it
   is not.
6. **Nothing can supply the missing values at request time.**
   The route's required-parameter check iterates `template.parameters`
   (`src/image-edit/routes.ts:107-111`), and a library row's parameter list is
   empty (`src/generation/workflow-library/row.ts:123`), so no parameter is
   required and none is rendered. The builder form seeds the param map from
   the same list (`src/frontend/alpine/comfyui-builder/form.ts:56`), so it
   submits an empty map and the build throws. The built-in template it replaced
   declared ten parameters
   (`src/image-edit/templates/builtin/img2img.ts:21-32`) and built fine.
7. **The seed only imports files that are not already in the library.**
   `src/generation/workflow-library/seed.ts:133` (`seedWorkflowLibrary`) skips
   an existing id with reason "already in library" (`:158-168`), so a re-seed
   repairs nothing on its own — an already-broken row stays broken until an
   operator acts on it through the admin workflow API.
8. **The same write leaves `requiredNodes` empty, and the admin list then
   under-reports what the workflow needs.** `src/generation/workflow-library/seed.ts:119` writes
   `requiredNodes: []` next to `parameters: []`, and `rowToTemplate` copies it
   straight through (`src/generation/workflow-library/row.ts:122`).
   `missingRequiredNodes` filters the row's declared names against the live
   server (`src/generation/workflow-library/row.ts:137-150`), so an empty list always yields an empty result —
   the admin workflow list reports `missing_nodes: []`
   (`src/routes/admin-comfyui-workflows/rows.ts:96`, served by `src/routes/admin-comfyui-workflows/list.ts:64-66`)
   for a row whose graph actually uses seven node classes
   (`CheckpointLoaderSimple`, `CLIPTextEncode`, `LoadImage`, `VAEEncode`,
   `KSampler`, `VAEDecode`, `SaveImage` in `configs/workflows/img2img.json`),
   while the built-in template it shadows declares six required nodes
   (`src/image-edit/templates/builtin/img2img.ts:20`).
9. **The built-in template's parameter list cannot be copied wholesale.**
   `parameterErrors` checks one direction only — every *declared* parameter
   must have a matching `{{placeholder}}` in the body
   (`src/generation/workflow-library/validate.ts:67-87`, called at `:169`).
   The built-in `img2img` declares ten parameters
   (`src/image-edit/templates/builtin/img2img.ts:21-32`), but the file's body
   has only eight placeholders — it has no `{{width}}`/`{{height}}`, because
   the graph loads an image instead of building an empty latent. Declaring
   `width`/`height` against that body is a validation *error*, and an invalid
   payload is skipped by the seed with a logged reason
   (`src/generation/workflow-library/seed.ts:177-182`) — the file would not be
   imported at all. The derived list must be exactly the placeholders present,
   with types drawn from the built-in template only where the names overlap.

**Acceptance Criteria:**

- [ ] AC1: A workflow file whose body contains placeholders is seeded with a parameter list that matches its placeholders (or the seed refuses the file with a clear, logged error), so `buildWorkflowGraph` never throws "unresolved placeholders" on a freshly imported file.
- [ ] AC2: The seeded parameters are exactly the placeholder names found in the body — a unit test pins the mapping for `configs/workflows/img2img.json` (the eight names) and for `configs/workflows/txt2img.json` — and each carries a type and label, so the payload still passes `validateWorkflowPayload` (`src/generation/workflow-library/validate.ts:169`) and no parameter is declared that the body has no `{{placeholder}}` for. The derivation reuses the shared placeholder collector `collectPlaceholders` (`src/generation/workflow-substitutor.ts:49-72`) — the same function the validator itself calls (`src/generation/workflow-library/validate.ts:169`) — rather than a second, private regex, so the seed's notion of a placeholder and the ingest gate's cannot drift; a second scanner is the bypass path this criterion forbids. The seeded parameter list is validated by the same shared gate every other write path uses, `validateWorkflowPayload`, which is called by the seed (`src/generation/workflow-library/seed.ts:177`), by the admin create route (`src/routes/admin-comfyui-workflows/create.ts:72`), by the admin update route (`src/routes/admin-comfyui-workflows/update.ts:73-80`), and by the template service (`src/generation/template-service/crud.ts:81`) — so the seeded row is held to exactly the contract an operator-created row is held to, and no write path can reach the library with a payload the others would reject. The test owns its resources: it derives the mapping from the file body without touching the database where that suffices, and where it must go through the seed it uses one in-memory DB for the file, created in `beforeAll` (`createTestDb`, `src/test-utils/create-test-db.ts:28-45`) and disposed in `afterAll`/`finally` (`destroyTestDb`, `src/test-utils/create-test-db.ts:63-82`) — one handle per file, which is the repo's stated contract for that helper (`src/test-utils/create-test-db.ts:50-55`), not one per test. It resets the seed's memoized owner before each seed (`resetSeedOwnerForTests`, `src/generation/workflow-library/seed.ts:71-79`) and reads the shipped `configs/workflows/` directory read-only — it never writes into it, and any fixture it does need goes in its own `mkdtemp` directory (`src/generation/workflow-library/seed-hydrate.test.ts:91`), never a shared fixed path.
- [ ] AC3: An operator-edited row is never clobbered by a re-seed: the "DB wins" hydrate contract at `src/generation/workflow-library/hydrate.ts:41-45` is preserved and a second seed run imports nothing and overwrites nothing.
- [ ] AC4: A regression test runs the seed → build path for every top-level `.json` file under `configs/workflows/` (the seed scans one directory level — `configs/workflows/uploads/` is not scanned) and asserts that no seeded row produces an unresolved-placeholder throw. It is parallel-safe by construction, because the canonical gate is parallel (`bun test --parallel=${TEST_JOBS:-4} --isolate`, `package.json:53,55`): the test file owns one in-memory DB, created in `beforeAll` (`createTestDb`, `src/test-utils/create-test-db.ts:28-45`) and disposed in `afterAll`/`finally` (`destroyTestDb`, `src/test-utils/create-test-db.ts:63-82`) — one handle per file, which is that helper's stated contract (`src/test-utils/create-test-db.ts:50-55`) — and the file never installs the process-global DB override, so no sibling file can be handed its handle; it hydrates into its own `new TemplateRegistry()` rather than the process-wide singleton (`src/generation/workflow-library/hydrate.ts:55-58`), and resets the module-global hydration memo (`resetWorkflowRegistryForTests`, `src/generation/workflow-library/hydrate.ts:129-131`) so it cannot read a sibling file's hydration. No fixed-path fixture, no shared DB, no ordering dependence: every case passes alone, in any order, and under the parallel gate. Every value the seed writes is carried as a bound parameter or inside the serialized payload, never concatenated into SQL text: the row id is derived from the filename (`src/generation/workflow-library/seed.ts:156`) and reaches the existence check and the insert only as a bound value (`:161`, `:186-195`), and the parameter names the fix derives from the file body — operator-controlled content — are stored inside the serialized payload, not in a query. The regression test includes a hostile-filename case: a workflow file whose name carries SQL metacharacters (`'; DROP TABLE prompt_templates; --.json`, staged in the test's own `mkdtemp` directory) seeds to a row whose id is stored verbatim, the `prompt_templates` table and its columns are still intact afterwards, and no other row is matched or altered — the same shape as the repo's existing injection-surface test (`src/cron/dag/engine.test.ts:202-220`).
- [ ] AC5: The guard error in `src/generation/workflow-library/row.ts:93-99` stays exactly as it is — the fix is upstream of it, in the seed, and the guard's existing unit test at `src/generation/workflow-library/seed-hydrate.test.ts:160-172` still passes. The new tests run alongside that file rather than replacing it, and do not depend on any other test having run first.
- [ ] AC6: An already-broken row in an existing database is repaired by an operator action on the admin workflow API — either PUT the row's parameter list (`PUT /api/v1/admin/comfyui-workflows/:id`, `src/routes/admin-comfyui-workflows/update.ts:52-53`, which accepts `parameters` at `:31` and carries them into the payload at `:76`) or DELETE the row (`src/routes/admin-comfyui-workflows/remove.ts:31-32`) so the next boot's seed re-imports the file with the corrected metadata — and the repair procedure is published where the docs are generated rather than hand-written: this ticket's own text is mirrored into the docs site by `giwt plan sync-docs` (`package.json:156-157`, which regenerates `docs/plan-gen/` from `.plan/`), so no separate hand-maintained page is added for it. The admin surface needs no API-reference edit either: both write routes already declare TypeBox bodies (`src/routes/admin-comfyui-workflows/create.ts:115`, `src/routes/admin-comfyui-workflows/update.ts:119`), so the generated spec describes the repair call, and `docs/reference/api.md` documents neither `comfyui-workflows` nor `image-edit` while the blocking `api - doc drift` gate (`scripts/check/api-doc-drift.mjs`) compares only the operations api.md already lists against the spec's paths — an unchanged path set stays in sync. The repair path stays admin-only: the whole surface is guarded by `requirePermission("admin.settings")` (`src/routes/admin-comfyui-workflows/shared.ts:17`, applied per sub-plugin) and every query is scoped to `modality = "workflow"` (`src/routes/admin-comfyui-workflows/rows.ts:55,71`), so the repair cannot reach another modality's template row. It is not a schema migration and not a destructive rewrite of operator-edited rows; the seed keeps skipping an existing id (`src/generation/workflow-library/seed.ts:158-168`).
- [ ] AC7: The library row still wins the id collision over the built-in TypeScript template after the fix, and the built-in `img2img` template's declared parameters are not the source of the seeded row's metadata — only the types of the names the body actually declares are borrowed from it.
- [ ] AC8: The seeded row's `requiredNodes` reflects the node classes its graph actually uses, so `missingRequiredNodes` (`src/generation/workflow-library/row.ts:137-150`) and the admin workflow list (`src/routes/admin-comfyui-workflows/rows.ts:96`) stop reporting "nothing missing" for a workflow that needs seven node classes.

**Notes / Evidence:**

- Placeholders in the seeded file: `configs/workflows/img2img.json:11,19,27,42,43,44,45,47`
- Same shape in the sibling file: `configs/workflows/txt2img.json:11,19,27,28,36,37,38,39`
- Empty parameter list written by the seed: `src/generation/workflow-library/seed.ts:118`
- Row id taken from the filename: `src/generation/workflow-library/seed.ts:156`
- "DB wins" hydrate contract: `src/generation/workflow-library/hydrate.ts:41-45`
- Id collision implemented as an overwrite: `src/image-edit/template-registry.ts:53-56,60-70`
- Built-in template with the same id: `src/image-edit/templates/builtin/img2img.ts:15`
- Built-in template's ten declared parameters (what the DB row replaced): `src/image-edit/templates/builtin/img2img.ts:21-32`
- The guard that throws: `src/generation/workflow-library/row.ts:93-99`
- Library rows carry an empty parameter list: `src/generation/workflow-library/row.ts:123`
- Required-parameter check reads that empty list: `src/image-edit/routes.ts:107-111`
- The builder form seeds params from that empty list: `src/frontend/alpine/comfyui-builder/form.ts:56`
- One-directional placeholder validation: `src/generation/workflow-library/validate.ts:67-87,169`
- The seed skips an id that already exists: `src/generation/workflow-library/seed.ts:133,158-168`
- Existing guard test that must keep passing: `src/generation/workflow-library/seed-hydrate.test.ts:160-172`
- The seed is called on boot: `src/server/boot-seed.ts:26`
- Empty `requiredNodes` written next to the empty parameters: `src/generation/workflow-library/seed.ts:119`; copied through at `src/generation/workflow-library/row.ts:122`
- The empty-list consequence in the admin list: `src/generation/workflow-library/row.ts:137-150`, `src/routes/admin-comfyui-workflows/rows.ts:96`, `src/routes/admin-comfyui-workflows/list.ts:64-66`
- One-directional placeholder validation (declared → placeholder): `src/generation/workflow-library/validate.ts:67-87,169`; an invalid payload is skipped at `src/generation/workflow-library/seed.ts:177-182`
- The seed scans one directory level only: `src/generation/workflow-library/seed.ts:142,154-155`
- The operator repair paths: `src/routes/admin-comfyui-workflows/update.ts:52-53`, `src/routes/admin-comfyui-workflows/remove.ts:31-32`
- The node classes in the seeded graph: `configs/workflows/img2img.json` nodes `1`-`8`
- The canonical gate is parallel, so the mandated tests must be too: `package.json:53,55` (`bun test --parallel=${TEST_JOBS:-4} --isolate`)
- Per-file in-memory DB and its teardown: `src/test-utils/create-test-db.ts:28-45` (`createTestDb`), `:63-82` (`destroyTestDb`); the one-handle-per-file contract is stated at `:50-55`
- Per-file temp dir convention: `src/generation/workflow-library/seed-hydrate.test.ts:91` (`mkdtemp(join(tmpdir(), "wf-seed-",))`)
- Module globals the seed and the hydration own, which the tests must reset: `src/generation/workflow-library/seed.ts:71-79`, `src/generation/workflow-library/hydrate.ts:88,129-131`
- Where the repair procedure is published: `giwt plan sync-docs` regenerates `docs/plan-gen/` from `.plan/` on every docs build (`package.json:156-157`; the mirror loop is `node_modules/giwt/src/commands/plan/sync-docs.ts:78-88`)
- The admin write routes' own generated specs: TypeBox bodies at `src/routes/admin-comfyui-workflows/create.ts:115` and `src/routes/admin-comfyui-workflows/update.ts:119`
- The API-reference drift gate that stays green because the path set is unchanged: `scripts/check/api-doc-drift.mjs` (documented-vs-spec comparison at `:119-133`, ratchet at `:146-149`), registered as a blocking gate at `scripts/check/parallel/gate-table.mjs:133`
