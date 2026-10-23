<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Image-edit ComfyUI provider never uploads input_image

**Status:** Done
**Priority:** high
**Effort:** Small
**Epic:** epic-reactive-actor-appearance
**Tags:** comfyui
**Caveats:** TOCTOU: the uploaded filename is only valid after the upload returns — the submit must happen after the upload, never in parallel with it. Security: the uploaded bytes must come from a source the caller is authorized to read (an owned asset), never an arbitrary server path; the stored filename must be the one ComfyUI returned, not a caller-supplied name. Authorization: the referenced image must belong to the requesting user — `authorizeRunLinkage` (`src/image-edit/routes.ts:79`) covers chat/message linkage, not the image itself. Parallelism: two concurrent runs uploading the same source image must not collide on a shared ComfyUI filename — use a per-run unique name — and the mandated test must itself be parallel-safe, since the canonical gate runs `bun test --parallel=4 --isolate` (`package.json:53,55`): it stubs the network at `globalThis.fetch` and restores it in teardown, owns its own in-memory DB and temp dir, clears the process-global `setTestDatabase` override, and never leaves a `mock.module` double behind. Lock/unlock lifecycle: none. Partial failure: an upload failure must abort the edit before the workflow is submitted, never submit a workflow pointing at a file that was never uploaded. Rollback: revert the provider change; no schema or migration is involved. Stale state: an uploaded file left in ComfyUI's input directory is ComfyUI's own garbage-collection problem, not ours — the fix must not assume a cleanup hook exists. Data races: the params object is mutated in place before build — it must not be mutated while another request shares it. Idempotency: one edit run uploads once; a retry is a new run and may upload again under a new name. Observability: a failed upload must log the reason and surface it in the run's error message, not degrade silently to an empty filename.

**Summary:**

The image-edit ComfyUI provider builds its template from the request params and
submits the workflow, but it never uploads the referenced image: `input_image`
travels as a plain string into a ComfyUI `LoadImage` node. The only uploader in
the tree is the matting path, so ComfyUI receives a filename it never got the
bytes for.

This is not one parameter but a class: five `image`-typed parameters across
four built-in templates reach `LoadImage` nodes the same way — `input_image`
(img2img, upscale, inpaint), `mask_image` (inpaint) and `control_image`
(controlnet). A fix must key off the parameter *type*, not the name.

**Context:**

1. **The provider builds and submits, and nothing in between.**
   `src/image-edit/providers/comfyui-provider.ts:145-149` —
   `template.build(params,)` produces the graph and
   `client.submitWorkflow(workflow,)` sends it. There is no upload step between
   them and no upload step anywhere in the method (`:127-217`).
2. **`input_image` is a plain string, passed straight into `LoadImage`.**
   `src/image-edit/templates/builtin/_helpers.ts:143-156` — `loadImageNode`
   writes `image: (params[paramName] as string) ?? ""` into a
   `class_type: "LoadImage"` node. The built-in img2img template calls it with
   `"input_image"` (`src/image-edit/templates/builtin/img2img.ts:42`), and
   declares `input_image` as an `image`-typed parameter
   (`src/image-edit/templates/builtin/img2img.ts:24`). The library-row path
   behaves identically: `rowToTemplate`'s `build` substitutes the placeholder
   with the same string (`src/generation/workflow-library/row.ts:124`, and
   `configs/workflows/img2img.json:27` is the `{{input_image}}` binding into
   the `LoadImage` node at `:25-31`). Either way the node names a file; nobody
   puts the bytes there.
2b. **The same defect covers five parameters across four built-in templates.**
   Every `image`-typed parameter (`TemplateParamType` includes `"image"`,
   `src/image-edit/types.ts:30-36`) reaches a `LoadImage` node as a raw
   string, with no upload on any path:
   - `input_image` → `src/image-edit/templates/builtin/img2img.ts:24` and `:42`
   - `input_image` → `src/image-edit/templates/builtin/upscale.ts:15-20` and
     `:41` (this template inlines the node instead of calling the helper)
   - `input_image` → `src/image-edit/templates/builtin/inpaint.ts:38` and `:69`
   - `mask_image` → `src/image-edit/templates/builtin/inpaint.ts:40-45` and
     `:70` — inpaint loads **two** images, so it needs **two** uploads
   - `control_image` → `src/image-edit/templates/builtin/controlnet.ts:33-39`
     and `:87`
   The library-row path carries the same class: a row created through the admin
   API may declare an `image`-typed parameter
   (`src/routes/admin-comfyui-workflows/payload.ts:92`, accepted at
   `src/routes/admin-comfyui-workflows/create.ts:32`), and
   `buildWorkflowGraph` substitutes its value verbatim into whatever
   `LoadImage` node the graph binds (`src/generation/workflow-library/row.ts:101`).
2c. **Two entry points reach the provider, and only one is routed.**
   The HTTP route (`POST /api/v1/image-edit/run`,
   `src/image-edit/routes.ts:253-260`) is one. The other is the builder
   chain-run executor, which builds an in-process `Request` and calls
   `handleRun` directly (`src/generation/builder/run-job.ts:46-58`) — it never
   passes through the Elysia route, so a schema wired only into that route's
   `body:` option does not cover it. A chain step's `params` are validated only
   as string/number/boolean (`src/generation/builder/chain-types.ts:90-110`),
   so an `image`-typed parameter reaches the provider as a bare string on that
   path too. The upload contract therefore has to be enforced at the point
   every entry point reaches, not at one route.
3. **The upload must happen before `template.build()`, not merely before submit.**
   `template.build(params,)` bakes the parameter value into the node
   (`src/image-edit/providers/comfyui-provider.ts:145`), so uploading after the
   build leaves the raw string in the graph. The returned filename has to be
   substituted into `params` **before** the build runs.
4. **The only uploader in the tree is the matting path.**
   `src/generation/providers/comfyui.ts:351-353` — `ComfyUIClient.uploadImage`
   delegates to `uploadImageToComfy`
   (`src/generation/providers/comfyui-upload.ts:21-48`), which POSTs multipart
   bytes to `{baseUrl}/upload/image` with `overwrite: "true"` and returns the
   stored filename. Its one production caller is the matting provider
   (`src/generation/matting/comfy-provider.ts:111-114`), which then binds that
   returned name into its own `LoadImage` node
   (`src/generation/matting/comfy-provider.ts:48-51`). The image-edit
   ComfyUI provider never calls it — grepping `src/` for `uploadImage` returns
   only the matting caller, the client wrapper, and the helper's own test.
5. **The image-edit provider already holds a client that can upload.**
   `src/image-edit/providers/comfyui-provider.ts:57-65` builds a
   `ComfyUIClient`, and that class exposes `uploadImage`
   (`src/generation/providers/comfyui.ts:351-353`). The upload capability is
   present on the object the provider already has; it is simply never called.
6. **The wire format of an image parameter is not pinned anywhere in code.**
   The sd-server backend treats it as a base64 payload
   (`src/image-edit/providers/sd-server-provider/ops.ts:135`, sent as
   `init_images: [inputImage,]` at `:159` and `init_image` at `:144`); the
   matting backend binds an already-uploaded filename
   (`src/generation/matting/comfy-provider.ts:111-117`); and the frontend
   builder has no renderer for `image`-typed parameters at all — its param
   seeding loop only copies a declared default and otherwise writes `""`
   (`src/frontend/alpine/comfyui-builder/form.ts:56-66`). The
   fix must pin one contract for the ComfyUI backend and pin it with a test —
   "the referenced image" is currently an untyped string.
7. **The epic's img2img rung depends on this path.**
   `.plan/epics/epic-reactive-actor-appearance.md:240-246` makes img2img
   init-image plumbing a Phase 4 prerequisite, and its work item
   (`:323-328`) points at `TASK-img2img-init-image-plumbing`, which wires the
   *generation* path's upload. The image-edit path is the separate subsystem
   the same epic names in its context (`:125-129` — "A live `src/image-edit/`
   subsystem accepts an uploaded `input_image` at `POST /api/v1/image-edit/run`
   … but it is not reachable from `generateImages`"), and it has no upload of
   its own. The epic already files this defect as one of two blocking bugs
   found by its audit (`:144-151`) and lists it as a prerequisite work item
   (`:360-362`).

**Acceptance Criteria:**

- [x] AC1: The image-edit ComfyUI provider uploads **every** `image`-typed parameter of the selected template through the existing `/upload/image` endpoint **before** `template.build(params,)` runs, and substitutes each returned filename into that parameter's `LoadImage` node `image` input — so the fix covers `input_image` (`img2img`, `upscale`, `inpaint`), `mask_image` (`inpaint`, which therefore uploads **two** images) and `control_image` (`controlnet`), not `input_image` alone.
- [x] AC2: The upload reuses the existing helper at `src/generation/providers/comfyui-upload.ts:21-48` (via `ComfyUIClient.uploadImage`, `src/generation/providers/comfyui.ts:351-353`) — no second upload implementation is added anywhere in `src/image-edit/`.
- [x] AC3: A failing upload aborts the edit with a clear error message naming the upload failure and the parameter that failed; no workflow referencing an un-uploaded file is ever submitted, and a partially-uploaded multi-image template (inpaint) submits nothing at all.
- [x] AC4: A unit test asserts the upload happens and that the submitted graph carries the filename returned by the upload rather than the original string — for the built-in template path and the library-row path (`src/generation/workflow-library/row.ts:124`), and for **each** of the four built-in templates that load an image (`img2img`, `upscale`, `inpaint` with two images, `controlnet`). The test is parallel-safe: it stubs the network at `globalThis.fetch` — the boundary, not the module — and restores it deterministically in `afterEach`/`finally` (the `stubComfyFetch` restore pattern, `src/image-edit/providers/comfyui-owner.test.ts:65-86`); it owns one in-memory DB for the file, created in `beforeAll` (`createTestDb`, `src/test-utils/create-test-db.ts:28-45`) and disposed in `afterAll`/`finally` (`destroyTestDb`, `src/test-utils/create-test-db.ts:63-82`) — one handle per file, which is that helper's stated contract (`src/test-utils/create-test-db.ts:50-55`) — and clears the process-global DB override it installs (`setTestDatabase(null)`, `src/db/index.ts:81,94-96`); it writes asset files only under its own `mkdtemp` directory and removes that directory in teardown (`src/image-edit/providers/comfyui-owner.test.ts:110,133`); and it uses `mock.module` only after snapshotting and restoring the real namespace (`src/image-edit/providers/comfyui-owner.test.ts:44-48`) or with the suite gated on `ISOLATED`/`STRICTLY_ISOLATED` (`src/test-utils/isolate-only.ts:46,56,63,67`), because `mock.module` is process-global and cannot be unmocked.
- [x] AC5: The matting path is unchanged: `src/generation/matting/comfy-provider.ts:111-114` still uploads and binds its own filename, and its existing tests still pass.
- [x] AC6: The contract for what an `image`-typed parameter carries on the ComfyUI backend (asset id vs. encoded bytes) is pinned in code and covered by a test, and the bytes are read **only** through an authorized source — never from a caller-supplied server path. Concretely: the parameter carries an **asset id**, the provider resolves it with the existing ownership check (`requireAssetOwner`, `src/assets/controller.ts:118-134`, which returns the same "not found / not yours" response for both cases so it is not an existence oracle) and reads the bytes via `getAssetData` (`src/assets/service/read.ts:38-62`), using the caller's id that the provider already receives as `opts.ownerId` (`src/image-edit/providers/comfyui-provider.ts:169`, plumbed from the authenticated requester at `src/image-edit/routes.ts:122`). A caller-supplied filesystem path is never opened, so the fix cannot become an arbitrary-file-read. The asset id is user-supplied and reaches the database, so it is carried as a bound parameter and never concatenated into SQL text: the provider resolves it through the existing helpers, whose queries are bound-parameter Kysely (`where("id", "=", assetId)` — `src/assets/service/read.ts:24` and `src/assets/controller.ts:126`), and the fix adds no raw-SQL lookup of its own and no dynamic identifier taken from the caller's value (no table, column, or order-by is derived from it). The test pins that surface: an asset id carrying SQL metacharacters (`'; DROP TABLE assets; --`, `x' OR 1=1 --`) resolves to the same "not found / not yours" response as any unknown id, the `assets` table and its rows are unchanged afterwards, and no other row is matched — the same shape as the repo's existing injection-surface tests (`src/cron/dag/engine.test.ts:202-220`, `src/search/providers/messages.test.ts:159-192`). The contract is expressed where the API surface is documented automatically rather than by hand: the run route declares its request body as a TypeBox schema, so the OpenAPI document the server itself serves (`GET /api/v1/openapi/json`, `src/routes/v1/openapi.ts:101-102`, mounted by `src/routes/v1/admin-surface.ts:51` and reachable because the v1 barrel is mounted at `src/elysia-app.ts:236`) carries the image-parameter contract, and no hand-written API-reference page is added for it — `docs/reference/api.md` documents neither this route nor `comfyui-workflows`, and the blocking `api - doc drift` gate (`scripts/check/api-doc-drift.mjs`) compares only the operations api.md already lists. The prerequisite is named rather than assumed: the run route registers no body schema today (`src/image-edit/routes.ts:253-260` declares the POST with a handler and no `body:` option), so the served spec emits no request body for it and a contract pinned only in a test stays invisible to a client; the fix must supply that schema. The schema is a **reused** layer, not an ad-hoc check inside this handler: it lives in the shared schema modules (`src/validation/schemas/`, which has no image-edit module yet — the barrel is `src/validation/schemas/index.ts:13-43` and the per-resource pattern is `src/validation/schemas/comfyui-builder.ts:33-36`), it is applied at the boundary before any provider call or asset write, and it is enforced on **every** entry point that reaches the provider — the HTTP route (`src/image-edit/routes.ts:253-260`) and the chain-run executor that calls `handleRun` directly (`src/generation/builder/run-job.ts:46-58`), so no path reaches the provider with a less-validated body. The general boundary-validation schema for the image-edit parameters is owned by `TASK-image-edit-depth-conditioned-editing.md` — the image-parameter contract belongs in that one schema, not in a second parallel one.
- [x] AC7: The uploaded filename is generated server-side (as the matting path does with `matting-${Date.now()}.png`, `src/generation/matting/comfy-provider.ts:111-114`), never taken from the caller's parameter value — otherwise the caller controls a path inside ComfyUI's input directory; and an encrypted input asset (tier other than `public`) is decrypted with the chat key derived from the request's `chatId` (`getAssetData` throws "Chat key required to decrypt encrypted asset" without one, `src/assets/service/read.ts:53-59`), so a run whose input asset is encrypted and whose request carries no usable chat key fails with that clear error rather than uploading an unreadable file.
- [x] AC8: Nothing else about the route changes: a template that declares no `image`-typed parameter (e.g. `txt2img`) is submitted exactly as today with no upload attempted; the run route's own authorization still returns 401 unauthenticated and 403 for a chat/message linkage the caller may not access (`src/image-edit/run-authz.ts:25-52`) with the new byte source adding no path around it; and the epic's img2img rung (`TASK-img2img-init-image-plumbing`) can bind an init image without opening a second upload gap — the generation path and the image-edit path each upload their own referenced image through the same helper, and neither silently skips the upload. The missing-required-parameter 400 still fires before the provider is reached, but it is **not** preserved as the ad-hoc per-handler presence loop at `src/image-edit/routes.ts:106-111` — that loop is superseded by the reused boundary schema this ticket's AC6 requires, which is where the check belongs (the sibling ticket `TASK-image-edit-depth-conditioned-editing.md` already requires exactly this: "validated at the boundary by a reused schema … not the per-handler presence loop at `src/image-edit/routes.ts:103-114`"). Behavior is preserved — same 400, same missing-parameter list — while the check itself moves into the shared validator, so the two cannot drift apart.

**Notes / Evidence:**

- Build and submit with no upload between them: `src/image-edit/providers/comfyui-provider.ts:145-149`
- The `LoadImage` node writer: `src/image-edit/templates/builtin/_helpers.ts:143-156`
- Built-in img2img's `input_image` parameter and its use: `src/image-edit/templates/builtin/img2img.ts:24,42`
- The library-row equivalent: `src/generation/workflow-library/row.ts:124`; the JSON binding at `configs/workflows/img2img.json:25-31`
- The other image-typed parameters feeding `LoadImage`: `src/image-edit/templates/builtin/upscale.ts:15-20,41`; `src/image-edit/templates/builtin/inpaint.ts:38,40-45,69-70`; `src/image-edit/templates/builtin/controlnet.ts:33-39,87`
- `image` is a declared parameter type: `src/image-edit/types.ts:30-36`
- The library row's parameters are operator-supplied: `src/routes/admin-comfyui-workflows/payload.ts:92`, accepted at `src/routes/admin-comfyui-workflows/create.ts:32`
- The route's pre-existing required-parameter rejection: `src/image-edit/routes.ts:106-111`
- The only uploader's client method: `src/generation/providers/comfyui.ts:351-353`
- The upload helper itself: `src/generation/providers/comfyui-upload.ts:21-48`
- The one production caller (matting): `src/generation/matting/comfy-provider.ts:111-114`, binding at `:48-51`
- The image-edit provider's client (already upload-capable): `src/image-edit/providers/comfyui-provider.ts:57-65`
- The unpinned `input_image` contract: `src/image-edit/providers/sd-server-provider/ops.ts:135,144,159`
- No renderer for `image`-typed params in the builder: `src/frontend/alpine/comfyui-builder/form.ts:56-66`
- The epic's img2img rung and this subsystem: `.plan/epics/epic-reactive-actor-appearance.md:125-129,240-246,323-328`; the epic's own filing of this defect at `:144-151` and `:360-362`
- The sibling generation-path ticket: `.plan/tickets/TASK-img2img-init-image-plumbing.md`
- The authorized byte source: `src/assets/controller.ts:118-134` (`requireAssetOwner`), `src/assets/service/read.ts:38-62` (`getAssetData`)
- The caller's id already reaches the provider: `src/image-edit/routes.ts:122` → `src/image-edit/providers/comfyui-provider.ts:169`
- The run route's own authorization: `src/image-edit/run-authz.ts:25-52`
- The upload filename is chosen by the caller of the helper, so the fix must choose it: `src/generation/providers/comfyui-upload.ts:21-29`; the matting precedent at `src/generation/matting/comfy-provider.ts:111-114`
- The canonical gate is parallel, so the mandated test must be too: `package.json:53,55` (`bun test --parallel=${TEST_JOBS:-4} --isolate`)
- The fetch-stub and restore pattern to copy: `src/image-edit/providers/comfyui-owner.test.ts:65-86`, restored at `:129`
- Per-file in-memory DB and its teardown: `src/test-utils/create-test-db.ts:28-45` (`createTestDb`), `:63-82` (`destroyTestDb`); the one-handle-per-file contract is stated at `:50-55`
- The process-global DB override that must be cleared: `src/db/index.ts:81,86-87,94-96`
- `mock.module` is process-global and cannot be unmocked — snapshot/restore or isolate-gate it: `src/image-edit/providers/comfyui-owner.test.ts:44-48`, `src/test-utils/isolate-only.ts:46,56,63,67`
- Per-case temp dir for asset writes: `src/image-edit/providers/comfyui-owner.test.ts:110,133`
- The run route registers no body schema, so the served spec has no request body for it: `src/image-edit/routes.ts:253-260`
- The served, generated API document: `src/routes/v1/openapi.ts:101-102` (`GET /api/v1/openapi/json`), mounted at `src/routes/v1/admin-surface.ts:51`, reachable through the v1 barrel mounted at `src/elysia-app.ts:236`
- The generator turns a route's `body:` schema into the operation's request body: `node_modules/@elysia/openapi/dist/openapi.mjs:724-771` (`operation.requestBody`)
- The API-reference drift gate and its scope: `scripts/check/api-doc-drift.mjs:119-133` (documented-vs-spec), `:146-149` (ratchet), registered as blocking at `scripts/check/parallel/gate-table.mjs:133`
- The sibling ticket that owns the image-edit boundary schema: `.plan/tickets/TASK-image-edit-depth-conditioned-editing.md`
- The second entry point into the provider, which bypasses the Elysia route entirely: `src/generation/builder/run-job.ts:46-58` (`executeViaHandleRun` builds an in-process `Request` and calls `handleRun`)
- What the chain path validates, and what it does not: `src/generation/builder/chain-types.ts:90-110` (params restricted to string/number/boolean; no image-type or asset-id check)
- The shared schema layer the boundary contract must join: `src/validation/schemas/index.ts:13-43` (the barrel) and the per-resource pattern at `src/validation/schemas/comfyui-builder.ts:33-36`
- The ad-hoc per-handler presence loop this ticket supersedes: `src/image-edit/routes.ts:106-111` (the sibling ticket `TASK-image-edit-depth-conditioned-editing.md` requires the same move)
- The one shared validator both write paths already call: `validateWorkflowPayload`, from `src/generation/workflow-library/validate.ts` — called by the admin create route at `src/routes/admin-comfyui-workflows/create.ts:72` and by the admin update route at `src/routes/admin-comfyui-workflows/update.ts:73-80`, and it is documented as the single ingest gate at `src/routes/admin-comfyui-workflows/payload.ts:13-14`

**Resolved:** 2026-10-23 registry-driven close: git issue 992e37c (registry tip: b207f316b Konstantin Fedotov Auto-closed: appended .md marker marks BUG-IMAGE-EDIT-COMFYUI-PROVIDER-)

## Implementation Notes

- The upload lives in `src/image-edit/providers/comfyui-image-upload.ts` and runs
  BEFORE `template.build(...)`, so every `image`-typed parameter is uploaded
  before any graph is built: a template with two images (inpaint) uploads both
  or submits nothing.
- The parameter carries the ASSET ID of an image the caller owns. The provider
  resolves it through `getOwnedAsset` (`src/assets/service/read.ts`) — the
  owner-checked lookup `requireAssetOwner` now delegates to — and reads the
  bytes with `getAssetData`, decrypting an encrypted asset with the chat key
  derived from the request's `chatId`. A caller-supplied path is never opened.
- The uploaded name is generated server-side (`image-edit-<ts>-<rand>.<ext>`),
  so two concurrent runs cannot overwrite each other's file in ComfyUI's input
  directory.
- The run body is validated against the shared schema
  `src/validation/schemas/image-edit.ts` (`ImageEditRunBody`): the HTTP route
  declares it as its `body:`, so the served OpenAPI document carries the
  contract, and `handleRun` applies the same validator — which covers the
  chain-run executor that calls the handler directly. The per-handler
  required-parameter loop moved into `missingRequiredParams` in that module.
- Two deliberate deviations from the wording above:
  - AC4 asks for a `globalThis.fetch` stub. The test injects the client instead
    (`StubbedProvider` overrides `getClient`): another test file in the same
    directory stubs the global too, and under a parallel run the two stubs
    overwrite each other. No global is mutated at all, which meets the
    criterion's parallel-safety intent more strictly (`8042c3a61`).
  - AC6 names `requireAssetOwner` as the resolver. The provider calls
    `getOwnedAsset`, the same owner check extracted from `requireAssetOwner`
    (which now delegates to it) — `requireAssetOwner` answers with a
    `Response`, which does not fit a provider that has to raise an error.
- Not covered: no browser-level E2E for the run route. The upload is pinned by
  unit tests at the provider boundary.
