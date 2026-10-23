# Interaction cycles — request path across surfaces

Scope: asset lifecycle, character seed/avatar, slash commands, SSE realtime,
chat turn, image generation.
Anchors are `path:line` in the repo working tree (the `tree/interaction-surfaces-audit`
worktree carries an identical `src/` checkout; line numbers match).
Per cycle the surfaces covered are: Web UI, TUI, headless-CLI equivalent, egui.

Backend is one Elysia app (`src/server/index.ts` -> `src/elysia-app.ts` ->
`src/routes/v1/*`); every surface below talks to the same routes over HTTP.

---

## Asset lifecycle

### 1. Upload (multipart)

- **Web UI** — `src/frontend/alpine/chat-utils/gallery.ts:166` posts FormData to
  `/api/v1/assets` and, on success, links the new asset to the chat
  (`src/frontend/alpine/chat-utils/gallery.ts:180`). Other Web upload paths reuse
  the same seam: message-edit attachments `src/frontend/alpine/chat-editing.ts:142`,
  GIF picker `src/frontend/alpine/chat-actions/gif-picker.ts:175`.
- **TUI** — no upload path. The TUI asset sidebar is read-only
  (`src/tui/asset-view.ts:200` `setChatId` -> `loadAssets` ->
  `GET /api/v1/assets?entity_type=chat&entity_id=...`; toggled with F2 in
  `src/tui/app-keys.ts:113`).
- **headless CLI** — the raw HTTP call is the equivalent (`POST /api/v1/assets`,
  multipart). No `lolo` subcommand exists (`bin/lolo.ts` only launches the TUI).
- **egui** — the wasm app cannot build multipart bodies, so the browser bridge
  owns the upload: `src/frontend/egui-gallery.ts:67` `uploadAsset()` opens a hidden
  file input and `src/frontend/egui-gallery.ts:91` POSTs to `/api/v1/assets`,
  reporting the id back through the `egui_asset_uploaded` sink.

### 2. Route -> service

- Route registration is deliberately **outside** the assets plugin:
  `src/elysia-app.ts:248` defines `uploadAsset`, `src/elysia-app.ts:270` mounts
  `app.post('/api/v1/assets', uploadAsset, { parse: 'none' })`. The comment at
  `src/elysia-app.ts:242` records why: Elysia's body parser consumes the multipart
  stream before `request.formData()` can run. `assetRoutes`
  (`src/assets/controller.ts:142`) serves every other asset endpoint and is
  mounted under `/api/v1` at `src/routes/v1/content-surface.ts:46`.
- Handler: `src/assets/controller.ts:496` `handleUpload` — requires
  `multipart/form-data` (`:507`), parses the form (`:513`), requires the `file`
  field (`:522`), validates size and mime (`:530`, `:534`), reads `alt_text`
  (`:537`), derives the chat key and **fails closed** when encryption is on
  (`:548`-`:568`), then calls `createAsset` (`:570`).
- Service: `src/assets/service/create.ts:37` `createAsset` — content hash
  (`:41`, `hashBuffer` `:24`), owner-scoped idempotent dedup with the opt-out
  `dedupe:false` storing a NULL hash (`:43`-`:49`), storage quota gate before any
  write (`:59`-`:65`), optional blob encryption (`:71`-`:86`), file write
  (`:88`), image metadata + alpha status extraction (`:95`-`:101`), alt-text
  sanitising (`:104`-`:106`), thumbnail generation (`:111`-`:114`), then the row
  insert.

### 3. Thumbnail (webp)

- `src/assets/service/thumbnail.ts:36` `encodeThumbnail` resizes to a 256px max
  edge and encodes WebP q85 (`THUMBNAIL_MAX_DIM` `:25`, `THUMBNAIL_WEBP_QUALITY`
  `:28`); `src/assets/service/thumbnail.ts:54` `writeThumbnail` writes
  `compressed/<ab>/<cd>/<assetId>_thumb.webp` and returns the relative path.
- Best-effort: an encode failure returns `null` and `thumbnail_path` stays NULL
  (`src/assets/service/thumbnail.ts:60`-`:64`).

### 4. Serve (raw / compressed / download / thumb)

- Routes: `src/assets/controller.ts:291` `/raw`, `:304` `/download`, `:317`
  `/thumb`, `:329` `/compressed`.
- Raw/download handlers: `src/assets/serve-raw.ts:36` `handleServeRaw`,
  `src/assets/serve-raw.ts:108` `handleDownload`.
- Compressed handler: `src/assets/serve-handlers.ts:169` `handleServeCompressed`
  resolves the variant path (`src/assets/variant-path.ts`) and **falls back to the
  raw bytes** when no variant exists (`src/assets/serve-handlers.ts:202`-`:204`),
  so a missing thumbnail never breaks a request.
- Auth: session/actor check `src/assets/serve-handlers.ts:62` `resolveAsset`
  (`canAccessAsset`), or a time-limited HMAC signed URL that replaces session auth
  (`src/assets/serve-handlers.ts:95` `signedUrlAuth`, `:118` `resolveForServe`;
  mint route `src/assets/controller.ts:345`).
- Web UI reads raw bytes through `/api/v1/assets/<id>/raw`
  (`src/frontend/alpine/chat-utils/gallery.ts:62`).
- egui thumbnails are fetched by the bridge (`src/frontend/egui-gallery.ts:46`
  `requestThumbnail`) from the grid view-model `thumbUrl`.
- TUI never fetches bytes — metadata only.

### 5. Link / unlink

- `POST /api/v1/assets/:id/links` — `src/assets/controller.ts:384`, owner-gated by
  `requireAssetOwner` (`src/assets/controller.ts:118`), service
  `src/assets/service/links.ts:23` `linkAsset` (re-link is a no-op on the UNIQUE
  violation).
- `GET .../links` — `src/assets/controller.ts:373`.
- `DELETE /api/v1/assets/:id/links/:linkId` — `src/assets/controller.ts:400`, service
  `src/assets/service/links.ts:79` `deleteAssetLink`, which **refuses an ambiguous
  delete** when the same `entity_id` is linked under two `entity_type`s
  (`:91`-`:99`).
- Actor-scoped unlink (avatar detach) lives separately:
  `src/routes/character-avatars-extra.ts:94` `unlinkAsset`, gated on asset
  ownership too (`src/routes/character-avatars-extra.ts:91`).
- Web link action: `src/frontend/alpine/chat-actions/dispatch.ts:105` POSTs
  `/api/v1/assets/<id>/links` with the entity type + entity id.
- egui attach: the Rust side owns the request —
  `native/loop-lore-egui/src/app.rs:503` `attach_asset` posts the URL built by
  `native/loop-lore-egui/src/api.rs:444` `gallery_attach_url`
  (`/api/v1/assets/<id>/links`).
- egui gallery grid/search: `native/loop-lore-egui/src/api.rs:432`
  `gallery_grid_url` -> `/dynamic/gallery/grid` (or `/dynamic/gallery/search` when
  filtered); view-model `src/routes/views/view-models/gallery-grid.ts`, server side
  `src/routes/views/plugin-dynamic.ts:82` and `:125`.
- TUI: read-only, no link/unlink.

### 6. Batch + delete

- Server-built zip: `src/routes/assets.ts:190` `POST /api/v1/assets/batch-download`;
  batch delete `src/routes/assets.ts:232`. Web callers:
  `src/frontend/alpine/chat-utils/gallery-batch.ts:78` and `:119`.
- Single delete: `src/assets/controller.ts:225` -> `deleteAsset`
  (`src/assets/service/delete.ts:35` `deleteAsset`; inside one transaction it
  deletes links, transforms and shares and clears the nullable avatar
  back-references first (`:81`-`:86`)).

---

## Character seed + avatar

### 1. Boot seed

- `src/server/init-background-services.ts:34` — when `config.characters.enabled`,
  the server imports the seeder (`:37`), merges built-in defaults with the
  template-loader characters (`:43` `mergeCharacterTemplates`), and calls
  `seedCharacterTemplates(database, mergedConfig, null, config.assets.uploadDir)`
  (`:49`). **This is the only call site** — seeding is boot-only.
- Seeder: `src/characters/seed/templates.ts:36` `seedCharacterTemplates` loops
  templates (`:48`), each `seedTemplate` (`:66`) resolving a stable id
  (`stableTemplateId`, `:79`), skipping an existing actor (`:82`), adopting a
  legacy crypto-random-id row (`:88`), inserting the actor row (`:116`), then
  identity traits (`:143` `persistIdentityTraits`) and the avatar link (`:144`).
- Idempotency / re-seed semantics: skip on existing (`:91`), adopt on id
  mismatch (`:88`), re-create after a delete — asserted in
  `src/characters/seed/seed-identity.test.ts:58`, `:95`, `:118`.

### 2. Avatar resolution (file / default)

- `src/characters/seed/avatar.ts:43` `resolveTemplateAvatar`:
  - `type: 'file'` -> `readFileSync(source.path)` + `mimeFromExtension`; an
    unreadable file returns `null` and the avatar is skipped (`:46`-`:53`).
  - `type: 'default'` -> a deterministic inline SVG placeholder so the wiring
    is always exercised (`:56`-`:62`).
- Config type: `src/config/sections/characters/types.ts:42`
  `avatar?: { type: 'file'; path: string } | { type: 'default' }`; schema
  `src/config/sections/characters/section.ts:59`. Shipped defaults still use
  `{ type: 'default' }` (`src/config/sections/characters/defaults.ts:26`, `:125`).

### 3. Avatar link

- `src/characters/seed/templates.ts:221` `linkTemplateAvatar` — needs an
  `uploadDir` and a template avatar (`:229`), resolves the bytes (`:230`),
  backfills the `system-user` row so the `assets.owner_id` FK holds for
  ownerless templates (`:235` `ensureSystemUser`, `src/characters/seed/avatar.ts:75`,
  `SYSTEM_USER_ID` `src/characters/seed/avatar.ts:66`), creates the asset
  (`:236` `createAsset`), and registers it as the primary `default` avatar
  (`:249` `avatars.createAvatar` with label `default`, `isPrimary: true`).
- Runtime avatar CRUD (not the seed path): `src/routes/character-avatars.ts:41`
  GET, `:63` POST (the referenced asset must be caller-owned,
  `src/routes/character-avatars.ts:85`), `:116` PUT, `:159` DELETE, `:191`
  POST `.../avatars/select`.

### 4. promoteAvatarToDefault (avatar-dogfood slice 1) -> restart reseed

- Lives only in the avatar-dogfood worktree:
  `tree/avatar-dogfood-defaults/src/characters/seed/promote.ts:82`
  `promoteAvatarToDefault`. PNG-only (`:83`, magic `:27`), slug derivation
  `slugForTemplate` (`:63`, `tpl-` prefix stripped, else `slugifyName`), target
  `configs/assets/characters/<slug>/default/happy.png` (`:88`), idempotent on
  identical bytes (`:92`), returns the literal to paste over the template `avatar`
  line (`:51`).
- Runbook (module header `tree/avatar-dogfood-defaults/src/characters/seed/promote.ts:16`-`:20`):
  generate art -> `GET /api/v1/assets/<id>/raw` -> call `promoteAvatarToDefault` ->
  paste the `{ type: 'file', path }` literal -> commit PNG + defaults.ts -> wipe DB
  + upload dir -> reboot.
- The reseed after restart runs the **existing** `file` hook:
  `resolveTemplateAvatar` + `linkTemplateAvatar`, insert-once, so already-seeded
  actors keep their avatars (module header
  `tree/avatar-dogfood-defaults/src/characters/seed/promote.ts:12`-`:14`).

### 5. Gap: no runtime seed endpoint

- There is **no** route that calls `seedCharacterTemplates` — the only call site is
  the boot path (`src/server/init-background-services.ts:49`). A grep of
  `src/routes/**` for `seedCharacterTemplates` finds nothing.
- Consequence: re-seeding or promoting art requires a process restart (or a
  wipe of DB + upload dir). The runtime substitutes are
  `POST /api/v1/actors` (`src/routes/characters/create.ts:29`) and character
  import (`src/characters/importers/character-systems/avatars.ts:32` calls
  `avatarService.createAvatar`).
- Same gap on the other surfaces: neither TUI nor egui exposes characters at all
  (egui is chat + gallery only), and the headless CLI has no characters command.

---

## Slash commands

### 1. Dispatch path

- There is **no** dedicated execution endpoint for commands. Commands are
  dispatched **inside** the message POST: `src/routes/messages/create.ts:139`
  `dispatchCommand(...)`; if it returns `handled`, the route returns that
  response and never writes a user message (`:140`). The GM natural-language
  tool path runs after and only when slash commands did not take over (`:143`).
- `src/routes/messages/command.ts:187` `dispatchCommand`:
  - strips a leading mention so group-chat addressing behaves like a bare
    command (`:197` `stripLeadingMention`),
  - parses the command and looks up the handler (`:199`-`:200`),
  - falls back to **workflow** runs when no handler matches (`:202`-`:214`),
  - loads chat row + participant role + site role, and the last 50 messages,
    concurrently (`:220`-`:229`, helper `fetchChatAndRole` `:144`),
  - enforces the **role gate** (`:246`-`:258`) and returns a
    `**Permission denied:**` system message when the participant tier is below
    the command minimum,
  - builds `CommandContext` (`:260`) and invokes the handler (`:276`); a throw
    becomes `**Command failed:**` (`:278`-`:281`),
  - otherwise the workflow path fills the next step (`:288`-`:300`).
- Command results persist a system message via
  `src/routes/messages/command.ts:54` `insertCommandSystemMessage`
  (encryption-aware).

### 2. Registry, gates, advertised list

- Registry: `src/assistant/commands/registry.ts:76` handler map,
  `registerCommand` `:113`, `getCommand` `:130`, `getCommandRequirement` `:139`,
  `listCommands` `:147` (advertised = `available !== false`).
- Role hierarchy: `src/assistant/commands/registry.ts:83` `ROLE_PRIORITY`
  (`guest:-1 < observer:0 < member:1 < gm:1 < owner:2`), check
  `satisfiesRole` `:102`. A command opts in with a `requiredRole`
  (`registry.ts:58`).
- Availability gate: `available: false` (`registry.ts:67`) keeps a stub callable
  but hidden from `GET /api/commands` and the FE palette. Applied to `/music`
  (`src/assistant/commands/music.ts:48`), `/sfx` + `/sound`
  (`src/assistant/commands/sfx.ts:37`, `:42`), `/video`
  (`src/assistant/commands/video.ts:30`). `/image` is availability-computed
  (`src/assistant/commands/image.ts:47`).
- World-mechanic gate: `/roll` and `/dice` require the world `RpgMechanic.Dice`
  (`src/assistant/commands/dice.ts:163`, `:172`).
- Command modules: barrel `src/assistant/commands/index.ts:7`-`:44` (38 modules;
  **62 registered names** = 54 literal `registerCommand("...")` names +
  3 harness verbs (`src/assistant/commands/harness-verbs.ts:152` -
  `/orchestrate`, `/workflowz`, `/omp`) + 5 interaction verbs
  (`src/assistant/commands/interaction.ts:182` over the catalogue
  `src/rpg/interaction/catalog.ts:26` - `/forage`, `/evaluate`, `/persuade`,
  `/hide`, `/study`); 4 of the 62 are `available: false` and `/image` is
  computed, so the advertised list is 57-58).
- Aliases are separate registrations: `/char`
  (`src/assistant/commands/impersonate.ts:50`), `/sum`
  (`src/assistant/commands/summarize.ts:160`), `/tl`
  (`src/assistant/commands/translate.ts:192`), `/sound`
  (`src/assistant/commands/sfx.ts:40`).
- Registry read endpoint: `src/routes/commands/index.ts:45` `GET /api/v1/commands`
  (mounted `src/routes/v1/admin-surface.ts:41`) — returns name, i18n
  `descriptionKey` and `requiredRole` (`src/routes/commands/index.ts:59`-`:61`).
- `/help` filters the list by the caller role (`src/assistant/commands/help.ts:7`).

### 3. Per surface

- **Web UI** — the composer sends the same `POST /api/v1/chats/:id/messages`; the
  command palette hydrates from `GET /api/v1/commands`.
- **TUI** — the TUI posts to the same endpoint (`src/tui/chat/api.ts:59`), so
  slash commands work unchanged; the request is **blocking** (`:64`-`:67`) —
  the POST waits for a whole assistant generation (`timeout: host.sendTimeoutMs`)
  and the response `assistantMessage` is appended afterwards
  (`src/tui/chat/api.ts:82`).
- **headless CLI** — equivalent is one HTTP POST to
  `POST /api/v1/chats/:id/messages` with a slash content body; no CLI wrapper
  exists.
- **egui** — the egui composer posts through the same Rust client seam; no
  command palette / command list exists on that surface.

---

## SSE realtime

No websocket anywhere (`src/transport/` is unmounted); realtime is SSE only.
All streams set `Content-Type: text/event-stream`, `Cache-Control: no-cache`,
`Connection: keep-alive`, `X-Accel-Buffering: no`.

### 1. Generation stream (per chat)

- Route: `src/generation/controller.ts:95` `GET /api/v1/generation/stream/:chatId`.
- Handler `src/generation/generation-routes/stream.ts:27` `handleGenerationStream`:
  chat-access check before opening the stream (`:44` `checkChatAccess` -> 403),
  `Last-Event-ID` parsing for reconnect (`:48`-`:50`), waits up to 15s for a
  buffer (`:60` `waitForBuffer`), **replays** buffered events (`:67`), closes if
  already done/errored (`:73`), else subscribes (`:78`), emits `stream-done`
  (`:93`) and `stream-error` (`:99`-`:104`), and keepalives every 15s (`:113`).
- The other SSE producer is the **generate POST** itself:
  `src/generation/generate-route/stream-to-client.ts:429`-`:436` returns the
  stream with the same headers; the cancel path aborts the provider call on
  client disconnect (`:410`-`:426`).
- Event contract (consumed identically by Web and egui): `stream-update`,
  `tool_call`, `stream-done`, `stream-error`.
- **Web**: `src/frontend/alpine/chat-generations.ts:22` `connectGenerationSSE`
  opens `EventSource(/api/v1/generation/stream/<chatId>)` (`:28`), handles
  `stream-update` (`:35`), `tool_call` (`:42`), `stream-done` (`:48`, then reloads
  messages), `stream-error` (`:70`), and terminal `error` (`:87`). Streaming off
  -> `checkGenerationStatus` polling (`:99`).
- **egui**: the browser bridge owns the EventSource
  (`src/frontend/egui-stream.ts:62` `openGenerationStream`, URL `:67`) and relays
  the four events into the Rust sink (`src/frontend/egui-stream.ts:68`-`:96`,
  teardown on terminal event). Rust side: `native/loop-lore-egui/src/stream.rs:21`
  `StreamEvent`, sinks `:121`-`:144`, `open_stream` `:159`; the reducer replaces
  streamed text (`native/loop-lore-egui/src/stream.rs:56`).
- **TUI**: **no SSE**. The chat is a blocking POST
  (`src/tui/chat/api.ts:59`-`:67`); the transcript is refreshed by an explicit
  `loadMessages` (`src/tui/chat/api.ts:153`). No spinner beyond the typing row.
- **headless CLI**: no SSE client; poll `GET /api/v1/generation/status/:chatId`
  instead.

### 2. Activity stream

- Route `src/routes/activity-stream.ts:113` `GET /api/v1/activity/stream`;
  requires a user (`:114`), streamer `src/routes/activity-stream.ts:50`
  `ActivityStreamer`, `open()` `:66` using the shared `sseStream` helper (`:82`);
  an initial snapshot failure degrades to `stream-error` (`:99`).
- **Web**: `src/frontend/alpine/notifications.ts:135` opens the EventSource and
  applies the `activity` snapshot (`:136`-`:138`). The chat activity bar
  deliberately reuses that one source instead of opening a second
  (`src/frontend/alpine/chat-activity.ts:7`).
- **TUI / egui**: no activity stream consumer.

### 3. Notifications stream

- Route `src/routes/notifications/index.ts:168` `GET /api/v1/notifications/stream`;
  streamer `src/routes/notifications/stream.ts:97`, `open()` `:113`; the initial
  snapshot is **strict** — a failed load surfaces `stream-error` rather than an
  empty inbox (`src/routes/notifications/stream.ts:154`-`:167`); periodic tick
  (`:169`) and keepalive (`:173`).
- **Web**: two consumers — the unread badge
  (`src/frontend/alpine/user-notifications.ts:78`, `notifications` event `:79`)
  and the notification manager (`src/frontend/alpine/notifications.ts:135`).
- **TUI / egui**: not consumed.

### 4. Other SSE endpoints (same machinery)

- World conditions: `src/routes/worlds/world-stream.ts:141`
  `GET /api/v1/worlds/:worldId/stream` — Web consumer
  `src/frontend/alpine/world.ts:160` `connectConditionsStream` (`:164`).
- Emotion-avatar job progress: `src/routes/character-emotion-avatars.ts:93`
  `GET /api/v1/actors/:actorId/emotion-avatars/jobs/:jobId/stream` — Web consumer
  `src/frontend/alpine/actor-emotion-avatars.ts:372`-`:375`, which closes the
  source on a terminal status (`:400`-`:402`).
- Export progress: `src/routes/export-sse/start.ts:35` (a POST that answers with
  an SSE body; the Web client consumes it manually because `EventSource` cannot
  POST — the fetch is `src/frontend/alpine/export-progress.ts:174`, the manual
  reader `:182`-`:186`).
- Middleware awareness: SSE responses are never buffered by the dynamic
  response middleware (`src/middleware/dynamic-response.ts:24`), and the
  idempotency/lifecycle middlewares skip SSE bodies
  (`src/middleware/idempotency.ts:179`, `src/middleware/lifecycle.ts:73`).

---

## Chat turn

### Cycle map

| Surface | Entry | HTTP | Blocking? | Assistant reply delivered by |
|---|---|---|---|---|
| Web UI | composer -> `chat-send.ts` | `POST /api/v1/chats/:id/messages` | no (201 immediately) | SSE `GET /api/v1/generation/stream/:chatId` |
| TUI | composer -> `handleSend` | `POST /api/v1/chats/:id/messages` | yes (up to `sendTimeoutMs`) | inline `assistantMessage` in the 201 (rule-based path only) |
| egui | composer -> `App::send` | `POST /api/v1/chats/:id/messages` | no | SSE through the wasm bridge (`EventSource` per chat) |
| headless | none exists | `POST /api/v1/auth/login` -> same POST | no | SSE, or poll `GET /api/v1/requests/:id/status` |

### Web UI (composer -> route -> service -> SSE)

1. Composer submit -> `src/frontend/alpine/chat-send.ts:169` (`buildSendBody`, defined at
   `src/frontend/alpine/chat-send.ts:38`),
   then `src/frontend/alpine/chat-send.ts:173-181`
   `apiFetch("/api/v1/chats/${activeChat}/messages")`.
2. `src/frontend/fe-fetch.ts:55-58` adds an `Idempotency-Key` header: a fresh
   `crypto.randomUUID()` when the caller passes `idempotencyKey: true`
   (`chat-send.ts:179`), or the caller-supplied string when it passes one.
   `src/frontend/fe-fetch.ts:49` reads the CSRF token and `:82` sends it as
   `auth.csrfToken`.
3. Route mount: `src/routes/v1/chats-surface.ts:33` (`prefix = "/api/v1"`) ->
   `src/routes/v1/chats-surface.ts:37` (`messagesRoutes`) ->
   `src/routes/messages/create.ts:40-41` `POST ${prefix}/chats/:id/messages`.
4. Server pipeline in `src/routes/messages/create.ts`:
   - `:64` `checkChatAccess` (`src/chat/service/access.ts:117`),
   - `:67` `enforceMuteGate` (`src/routes/messages/guards.ts:110`),
   - `:76-83` idempotency short-circuit -> `findByIdempotencyKey`
     (`src/routes/messages/swipe-race-insert.ts:120`),
   - `:139` slash-command dispatch (`src/routes/messages/command.ts:187`) —
     handled commands return **200** and skip the message insert entirely,
   - `:143` GM natural-language tool execution,
   - `:170` `insertUserMessageRow` (`src/routes/messages/insert-message.ts:54`),
   - `:247` `maybeAutoReply` (`src/routes/messages/reply.ts:53`),
   - `:258` `createResponse` (`src/routes/messages/create-response.ts:28`).
5. Reply branch (`src/routes/messages/reply.ts`):
   - LLM configured -> `:91-107` `void triggerAutoGeneration(...)` fire-and-forget,
     `replied: false` -> `create-response.ts:47` returns **201 `{id, context}`**
     with **no** `assistantMessage`;
   - rule-based assistant enabled -> `:210-214` returns 201 with
     `assistantMessage: {id, content}` inline.
6. The browser then opens the stream: `src/frontend/alpine/chat-send.ts:194`
   -> `sendWithPreferredMode` -> `src/frontend/alpine/chat-generations.ts:22-30`
   `connectGenerationSSE` -> `EventSource("/api/v1/generation/stream/:chatId")`.
   Server: `src/generation/controller.ts:95` ->
   `src/generation/generation-routes/stream.ts:27` `handleGenerationStream`
   (`:60` `waitForBuffer(chatId, 15_000)`, `:67` replay for reconnecting
   clients, `:78` subscribe, `:113` 15s keepalive, `:136` `text/event-stream`).
   Producers append to the buffer at
   `src/generation/auto-gen/call-llm.ts:204,257` and finish at
   `src/generation/auto-gen/post-store.ts:194` (`buffer.signalDone()`).

### TUI (blocking POST variant)

- `src/tui/chat/api.ts:43-93` `handleSend` — one blocking POST at
  `src/tui/chat/api.ts:59` to `/api/v1/chats/:id/messages`, body
  `{content, role:"user"}`, timeout `src/tui/chat/api.ts:66`
  `host.sendTimeoutMs` (default 300 000 ms, `src/config/sections/tui.ts:12`).
- It reads `data.id` (`src/tui/chat/api.ts:79`) and `data.assistantMessage`
  (`src/tui/chat/api.ts:82`). **No SSE client exists in `src/tui/`** (no
  `EventSource`, no `generation/stream` reference).
- Consequence: with LLM generation configured the POST returns 201 `{id, context}`
  with no `assistantMessage`, so the TUI renders only the user bubble; the
  assistant turn is not fetched until an explicit reload
  (`src/tui/app-keys.ts:156` `loadMessages`). With the rule-based assistant the
  inline `assistantMessage` is rendered immediately.
- Slash commands: the TUI fetches the command catalogue
  (`src/tui/chat/api.ts:191` `loadCommands`, route
  `src/routes/commands/index.ts:49` `GET /api/v1/commands`) but never dispatches
  command **actions**. A typed `/image …` therefore hits
  `src/routes/messages/command.ts:322-329`, which returns 200
  `{command, systemMessage, action, actionPayload}` — no `id` field — and the TUI
  then calls `host.addMessage({id: undefined, …})` (`src/tui/chat/api.ts:79`).

### egui

- `native/loop-lore-egui/src/app.rs:236-272` `send()`: URL from
  `native/loop-lore-egui/src/api.rs:80` (`/api/v1/chats/{id}/messages`), body from
  `native/loop-lore-egui/src/api.rs:167` (`{content, role:"user"}`), response
  parsed by `native/loop-lore-egui/src/api.rs:264` `parse_sent_message`.
- Stream: `native/loop-lore-egui/src/app.rs:267` `stream::open_stream(&chat_id)`
  -> wasm bridge `src/frontend/egui-stream.ts:62` `openGenerationStream`
  (one `EventSource` per chat, `:42` registry) -> same server route as the Web UI.
- Parsing mismatch: `parse_sent_message` (`api.rs:264-276`) reads only
  `data.message` / `assistantMessage`. The server 201 body is
  `{id, context, meta}` (`src/routes/http-utils/responses.ts:93-108` merges
  `meta` into the object; there is no `data` envelope), so `parse_message_row`
  (`api.rs:281-303`) yields a user row whose `content` is the empty default
  (`api.rs:295`) — the sent text never round-trips; it is only shown after
  a message reload.

### Headless equivalent

There is **no chat CLI**: `bin/lolo.ts` only launches the TUI, and
`src/cli/parser.ts` only parses launcher flags (no `chats/` or `generation/`
references in `src/cli/`). The headless equivalent is a curl chain:

1. `POST /api/v1/auth/login` (`src/routes/auth/login.ts:49`, mounted at
   `src/routes/v1/base-surface.ts:55`) -> `ll_token` cookie + CSRF cookie.
2. `POST /api/v1/chats/:id/messages` with the `X-CSRF-Token` header **and** the
   CSRF cookie — `src/middleware/csrf.ts:249` requires both halves to be present
   and `:261` requires them to be equal; the wiring lives in
   `src/middleware/csrf-plugin.ts`. `POST /api/v1/auth/login` is exempt
   (`src/middleware/csrf.ts:23-35`).
3. Stream the reply: `GET /api/v1/generation/stream/:chatId` (SSE), or poll
   `GET /api/v1/requests/:id/status` (`src/routes/requests/status.ts:54`),
   which is registered by `src/routes/messages/reply.ts:80-88` via
   `asyncStore.track` (route pattern `/api/chats/${chatId}/messages`).

### Where idempotencyKey bites

Three independent mechanisms, only one of which the browser uses:

- **Global middleware cache** — `src/middleware/idempotency.ts:93` `idempotent()`,
  key = `makeKey(method, route, requestId, userId)` (`idempotency.ts:131`).
  `requestId` comes from `src/middleware/request-id.ts:64` `resolveRequestId`,
  which prefers `x-request-id` and treats `idempotency-key` as an alias
  (`request-id.ts:27-29`). Wired at `src/elysia-app.ts:184-194`.
  - A re-fired request while the first is in flight -> **409**
    (`idempotency.ts:133-137`).
  - A completed request -> verbatim replay (`idempotency.ts:141-149`).
  - SSE responses are **released, not cached** (`idempotency.ts:179-182`).
  - *Bite*: the Web UI mints a **new UUID per call** (`fe-fetch.ts:55-56`),
    so a double-submit produces two distinct keys and the middleware never
    coalesces it. Only a caller that reuses a fixed key string gets a replay.
- **Route/DB key** — `body.idempotencyKey` (`src/routes/messages/create.ts:76`)
  with the unique index from `src/db/migrations/045_messages_idempotency_unique.ts`.
  **The Web UI never sets it** (the body builder does not include it); only
  `src/chat/scheduled/dispatcher.ts:146` and the merge service
  (`src/chat/service/merge/merge-service.ts:79-102`) do. So the browser's
  duplicate-send protection is the (ineffective for double-clicks) middleware
  layer, not the DB key.
- **Generation key** — `src/generation/auto-gen/prepare-generation.ts:126`
  mints `uid()` per generation attempt; used by
  `src/generation/cancellation-actions/inflight.ts:15` for cancellation.

### Where rate limits bite

- `src/routes/v1/governance.ts:36-46` — `governanceGuard` runs on every v1
  request with an authenticated user, keyed `${userId}:${policy.name}`.
  429 body + `retry-after` / `ratelimit-remaining` headers at
  `src/routes/v1/governance.ts:60-66`.
- Policy table `src/api-governance/rate-limiting/policies.ts:62-66`:
  - `/api/v1/generation` -> `generationPolicy` 20/min, burst 5 (`:28`),
  - `/api/v1/chats` -> `chatPolicy` 300/min, burst 50 (`:31`),
  - default -> `defaultPolicy` (`:22`).
- Bite 1: the chat POST is in the **chat** bucket (300/min), but the SSE
  reconnect `GET /api/v1/generation/stream/:chatId` is in the **generation**
  bucket (20/min, burst 5) — five chat turns/stream reconnects per minute
  exhaust the LLM/image budget even though no generation was requested.
- Bite 2: `POST /api/v1/generation/image` shares that same 20/min bucket
  (`src/generation/controller.ts:123`), so image generation and stream
  connects compete.
- Bite 3: `GET /api/v1/requests/:id/status` polling falls through to the
  default bucket (`src/routes/v1/base-surface.ts:72`).

### Chat-turn gaps

1. TUI has no SSE and no reload-after-send -> the assistant turn is invisible
   until F5 (`src/tui/app-keys.ts:156`).
2. TUI does not dispatch command actions -> `/image` in the TUI produces a
   message with an undefined id (`src/tui/chat/api.ts:80`).
3. egui drops command action payloads (`api.rs:264-276`) and shows an empty
   content bubble for the 201 envelope (`api.rs:297-300`).
4. Browser double-send is not coalesced (fresh `Idempotency-Key` per call,
   `src/frontend/fe-fetch.ts:55-56`), and the DB-level `idempotencyKey` is
   unused by the Web UI (`src/routes/messages/create.ts:76`).

---

## Image generation

### Cycle map

| Surface | Entry | HTTP | Image provider called? | Result surfaced |
|---|---|---|---|---|
| Web UI | `/image <prompt>` in composer | `POST /api/v1/chats/:id/messages` -> 200 command envelope -> `POST /api/v1/generation/image` | yes | toast only; asset appears via gallery/asset reload |
| Web UI | "generate image" on a message | `POST /api/v1/generation/image` | yes | toast only |
| TUI | — | — | — | no entry point at all |
| egui | — | — | — | no entry point at all |
| headless | — | `POST /api/v1/generation/image` | yes | JSON `data[].url` |

### Command -> action -> provider -> asset row

1. `/image` is registered at `src/assistant/commands/image.ts:47`; availability
   is gated on a configured SD provider (`src/assistant/commands/image.ts:21-27`,
   `resolveImageCommandAvailability`), so it disappears from `listCommands()`
   when no provider exists.
2. The handler (`src/assistant/commands/image.ts:30-45`) returns
   `action: "generate-image"` + `actionPayload: {prompt}` — it deliberately does
   **not** generate (double-execution guard, comment at `image.ts:5-9`).
3. Server dispatch: `src/routes/messages/create.ts:139` ->
   `src/routes/messages/command.ts:187` `dispatchCommand` -> registry lookup
   `src/routes/messages/command.ts:200` (`getCommand`), role gate
   `command.ts:246-258`, optional system-message insert `command.ts:318-320`,
   response `src/routes/messages/command.ts:322-329` — **200** with
   `{command, systemMessage, action, actionPayload}`.
   Because the command short-circuits at `create.ts:139`, **no user message row
   is inserted** for a `/image` turn.
4. Web UI action router: `src/frontend/alpine/chat-send.ts:186-194`
   (`data.action` -> `dispatchCommandAction`) ->
   `src/frontend/alpine/chat-actions/dispatch.ts:66-75` `"generate-image"` ->
   `src/frontend/alpine/chat-actions/generation-helpers.ts:31-75`
   `dispatchGenerationAction` -> `POST /api/v1/generation/image` with
   `{prompt, chatId}`.
5. Direct-from-message variant: `src/frontend/alpine/chat-actions/media.ts:18-33`
   `generateImageFromMessage` -> `POST /api/v1/generation/image` with
   `{chatId, messageId, prompt}`.
6. Server route: `src/generation/controller.ts:123` ->
   `src/generation/image-gen-route.ts:62` `handleImageGeneration`:
   - `:69-71` 401 without a user,
   - `:79-82` `checkChatAccess` on `req.chatId` (IDOR guard for foreign chats),
   - `:88-107` optional user image template (`{{variables}}` render),
   - `:109-111` 400 when the prompt is empty,
   - `:114-124` `pickSdProvider` (`src/config/schema/sd-provider.ts:19`) -> **501**
     when no SD provider is configured,
   - `:126-137` LoRA only for `comfyui` / `sdcpp` backends,
   - `:139` `n` clamped to 4,
   - `:148-166` pre-provider storage-quota gate `assertGenerationFitsStorage`
     (`src/federation/storage-quota.ts:164`) -> 429/503 via
     `quotaExceededResponse` (`storage-quota.ts:73`) before paying the provider,
   - `:168` `generateImages` (`src/generation/image-engine/index.ts:27`),
   - `:203` `persistGeneratedImages` (`src/assets/service/persist-generated.ts:59`)
     -> `createAsset` (`src/assets/service/create.ts:37`), content-addressed by
     SHA-256 of the bytes with a unique index (`persist-generated.ts:63-67`),
   - `:216-223` response `{data:[{id, url, filename, mimeType}]}` — the envelope
     key is `data`, and `url` is the unversioned `/api/assets/{id}/raw`.
7. Serving the bytes: `src/assets/controller.ts:142` `assetRoutes` (mounted with
   the `/api/v1` prefix at `src/routes/v1/content-surface.ts:44`) and
   `src/assets/controller.ts:291` `GET ${prefix}/assets/:id/raw`.

### Headless equivalent (curl chain)

```
# 1. session + CSRF
curl -c jar -X POST http://localhost:3000/api/v1/auth/login \
     -H 'Content-Type: application/json' \
     -d '{"username":"...","password":"..."}'
CSRF=$(grep csrf_token jar | awk '{print $7}')

# 2. generate
curl -b jar -X POST http://localhost:3000/api/v1/generation/image \
     -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF" \
     -d '{"prompt":"a medieval castle at sunset","chatId":"<chat>"}'

# 3. fetch the bytes
curl -b jar -o out.png http://localhost:3000/api/v1/assets/<assetId>/raw
```

Auth + CSRF requirements: `src/routes/auth/login.ts:49`,
`src/middleware/csrf.ts:236-243` (header **and** cookie),
`src/middleware/csrf-plugin.ts`.

### Image gaps

1. **egui has no image action**: no `generation/image` reference anywhere in
   `native/`, and `parse_sent_message` (`native/loop-lore-egui/src/api.rs:264`)
   discards the `action` field of the command envelope, so a typed `/image`
   yields nothing at all.
2. **TUI has no image action**: no `generation/image` or `generate-image`
   reference in `src/tui/`; the TUI fetches the command list but never
   dispatches actions.
3. The returned asset URL is **unversioned** (`/api/assets/{id}/raw`,
   `src/generation/image-gen-route.ts:218`) while the route is mounted at
   `/api/v1/assets/:id/raw` (`src/assets/controller.ts:291` via
   `src/routes/v1/content-surface.ts:44`); the unversioned form only works via
   the 308 redirect in `src/elysia-app.ts:283-289`.
4. `dispatchGenerationAction` opens the LLM generation SSE after a successful
   image POST (`src/frontend/alpine/chat-actions/generation-helpers.ts:57`),
   but image generation never writes to the generation buffer, so the stream
   ends in the "No active generation" terminal error
   (`src/generation/generation-routes/stream.ts:60-63`).
5. Image generation is charged to the same 20/min burst-5 bucket as the chat
   SSE stream (`src/api-governance/rate-limiting/policies.ts:28,62-66`).
6. The 501 for "no SD provider configured" is the only signal a client gets;
   the `/image` command is also hidden from the command catalogue in that state
   (`src/assistant/commands/image.ts:21-27`).
## Surface coverage summary

| Cycle | Web UI | TUI | headless CLI | egui |
|---|---|---|---|---|
| Asset upload | multipart POST (`chat-utils/gallery.ts:166`) | **none** (read-only sidebar) | raw HTTP only | browser bridge (`egui-gallery.ts:91`) |
| Asset serve | `/raw` (`gallery.ts:62`) | metadata only | raw HTTP | bridge thumbnail fetch (`egui-gallery.ts:46`) |
| Asset link/unlink | POST links (`chat-actions/dispatch.ts:105`) | **none** | raw HTTP | Rust attach (`app.rs:503`) + grid (`api.rs:432`) |
| Character seed | boot-only, no route | **none** | **none** | **none** |
| Avatar promote | operator script only, no endpoint | **none** | **none** | **none** |
| Slash command | via message POST + palette | via message POST (blocking) | via message POST | via message POST, no palette |
| SSE generation | EventSource (`chat-generations.ts:28`) | **none** (blocking POST) | status polling | bridge EventSource (`egui-stream.ts:67`) |
| Chat turn (send) | POST `/api/v1/chats/:id/messages` (`chat-send.ts:173`) | POST, blocking (`tui/chat/api.ts:59`) | raw HTTP (login first) | POST (`app.rs:246`) + SSE bridge (`egui-stream.ts:62`) |
| Image generation | `/image` -> `POST /api/v1/generation/image` (`dispatch.ts:66`) | **none** | raw HTTP only | **none** |
| SSE activity | `notifications.ts:135` | **none** | **none** | **none** |
| SSE notifications | `user-notifications.ts:78` | **none** | **none** | **none** |

