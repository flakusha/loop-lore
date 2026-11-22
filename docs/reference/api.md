<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# API Reference

> **DO NOT EDIT.** This page is generated from `docs/reference/openapi.json`
> by `bun run openapi:md`. Edit only the region between the
> `api-reference:handwritten` markers, then regenerate with
> `bun run openapi && bun run openapi:md`.

<!-- api-reference:handwritten:begin -->
## Authentication

Web-first cookie auth. Login/register/demo-login `POST` with
`Content-Type: application/x-www-form-urlencoded` (`username`, `password`
fields — JSON bodies are rejected with 4xx). On success the server creates
a session row, sets an `ll_token` HttpOnly cookie, and returns
`HX-Redirect: /views/chat`. Failures return an inline
`<p class="error-msg">` HTML swap for htmx callers (`HX-Request: true`),
or a `{ error, code }` JSON envelope when the caller sends
`Accept: application/json`. See `docs/spec/auth-middleware.md`.

## Base URL

All endpoints prefixed with `/api/v1/` (versioned; see `docs/spec/api-versioning.md`).

## Beyond this page

The generated tables above cover every operation in the served spec, including RPG (`/api/rpg/*`), trade, generation, assets, admin and plugins. For request/response schemas see `reference/openapi.json` (gitignored; regenerate with `bun run openapi`) and [`spec/api-routes.md`](../spec/api-routes.md).

## Error Responses

All errors follow a flat `{ error, code, meta, data? }` envelope (no nested error object). Common codes:

- `VALIDATION_ERROR` — invalid request data
- `UNAUTHORIZED` — missing/invalid auth
- `FORBIDDEN` — insufficient permissions
- `NOT_FOUND` — resource not found
- `CONFLICT` — resource conflict (e.g. duplicate username)
- `INTERNAL_ERROR` — unexpected server error
- `TOO_MANY_REQUESTS` — rate limit exceeded
- `NOT_IMPLEMENTED` — reserved v1 operation

## Rate Limiting

429 response: flat envelope with `code: "TOO_MANY_REQUESTS"`; limit, remaining, reset and retry-after travel in `ratelimit-*` / `retry-after` headers.

## Pagination

Query params: `page` (default 1), `pageSize` (default 50, max 200). Response: `{ data: [...], pagination: { total, page, pageSize, totalPages } }`
<!-- api-reference:handwritten:end -->

<!-- api-reference:generated:begin -->

410 of 1064 operations have no `summary`/`description` in the spec; those rows render as `—`.

## v1 endpoints

| Method | Path | Summary |
| --- | --- | --- |
| GET | /api/v1/activity/stream | Stream activity via SSE |
| GET | /api/v1/actors | List actors |
| POST | /api/v1/actors | Create actor |
| DELETE | /api/v1/actors/{actorId} | Delete actor |
| GET | /api/v1/actors/{actorId} | Get actor |
| PUT | /api/v1/actors/{actorId} | Update actor |
| DELETE | /api/v1/actors/{actorId}/assets/{assetId} | Unlink asset from actor |
| DELETE | /api/v1/actors/{actorId}/availability | Delete character availability settings |
| GET | /api/v1/actors/{actorId}/availability | Get character availability settings |
| POST | /api/v1/actors/{actorId}/availability | Create or update character availability |
| GET | /api/v1/actors/{actorId}/avatars | List avatars |
| POST | /api/v1/actors/{actorId}/avatars | Create avatar |
| DELETE | /api/v1/actors/{actorId}/avatars/{avatarId} | Delete avatar |
| GET | /api/v1/actors/{actorId}/avatars/{avatarId} | Get actor avatar |
| PUT | /api/v1/actors/{actorId}/avatars/{avatarId} | Update avatar |
| GET | /api/v1/actors/{actorId}/avatars/config | Get avatar config |
| PUT | /api/v1/actors/{actorId}/avatars/config | Update avatar config |
| POST | /api/v1/actors/{actorId}/avatars/select | Select avatar |
| GET | /api/v1/actors/{actorId}/card | Get character card |
| DELETE | /api/v1/actors/{actorId}/e2e-public-key | Revoke actor's active E2E public key |
| GET | /api/v1/actors/{actorId}/e2e-public-key | Get actor's active E2E public key |
| PUT | /api/v1/actors/{actorId}/e2e-public-key | Register or rotate actor's E2E public key |
| POST | /api/v1/actors/{actorId}/emotion-avatars | — |
| GET | /api/v1/actors/{actorId}/emotion-avatars/jobs | — |
| GET | /api/v1/actors/{actorId}/emotion-avatars/jobs/{jobId} | — |
| POST | /api/v1/actors/{actorId}/emotion-avatars/jobs/{jobId}/cancel | — |
| GET | /api/v1/actors/{actorId}/emotion-avatars/jobs/{jobId}/stream | — |
| POST | /api/v1/actors/{actorId}/emotion-avatars/regenerate | Regenerate emotion avatars |
| GET | /api/v1/actors/{actorId}/emotions | List actor emotions |
| POST | /api/v1/actors/{actorId}/emotions | Set actor emotion |
| DELETE | /api/v1/actors/{actorId}/emotions/{emotionId} | Delete actor emotion |
| GET | /api/v1/actors/{actorId}/emotions/{emotionId} | Get actor emotion |
| GET | /api/v1/actors/{actorId}/export | — |
| GET | /api/v1/actors/{actorId}/items | List Item |
| POST | /api/v1/actors/{actorId}/items | Create Item |
| DELETE | /api/v1/actors/{actorId}/items/{entityId} | Delete Item |
| GET | /api/v1/actors/{actorId}/items/{entityId} | Get Item |
| PUT | /api/v1/actors/{actorId}/items/{entityId} | Update Item |
| POST | /api/v1/actors/{actorId}/items/{itemId}/equip | Equip actor item |
| POST | /api/v1/actors/{actorId}/items/{itemId}/transfer | Transfer actor item |
| POST | /api/v1/actors/{actorId}/items/{itemId}/unequip | Unequip actor item |
| GET | /api/v1/actors/{actorId}/items/carry | Actor carry status |
| GET | /api/v1/actors/{actorId}/items/equipped | List equipped items |
| DELETE | /api/v1/actors/{actorId}/licensing | Delete character licensing |
| GET | /api/v1/actors/{actorId}/licensing | Get character licensing information |
| POST | /api/v1/actors/{actorId}/licensing | Create or update character licensing |
| GET | /api/v1/actors/{actorId}/licensing/history | Get character licensing change history |
| GET | /api/v1/actors/{actorId}/lore-entries | List Lore entry |
| POST | /api/v1/actors/{actorId}/lore-entries | Create Lore entry |
| DELETE | /api/v1/actors/{actorId}/lore-entries/{entityId} | Delete Lore entry |
| GET | /api/v1/actors/{actorId}/lore-entries/{entityId} | Get Lore entry |
| PUT | /api/v1/actors/{actorId}/lore-entries/{entityId} | Update Lore entry |
| GET | /api/v1/actors/{actorId}/memories | List Memory |
| POST | /api/v1/actors/{actorId}/memories | Create Memory |
| DELETE | /api/v1/actors/{actorId}/memories/{entityId} | Delete Memory |
| GET | /api/v1/actors/{actorId}/memories/{entityId} | Get Memory |
| PUT | /api/v1/actors/{actorId}/memories/{entityId} | Update Memory |
| POST | /api/v1/actors/{actorId}/memories/{entityId}/carry | Carry Memory into chat |
| GET | /api/v1/actors/{actorId}/memories/{entityId}/expand | Expand Memory source chain |
| GET | /api/v1/actors/{actorId}/memories/audit | List memory audit log |
| POST | /api/v1/actors/{actorId}/memories/carry-except | Carry all Memories except one |
| GET | /api/v1/actors/{actorId}/mood | Get actor mood |
| POST | /api/v1/actors/{actorId}/mood | Create actor mood |
| PUT | /api/v1/actors/{actorId}/mood | Update actor mood |
| POST | /api/v1/actors/{actorId}/mood/delta | Apply happiness delta |
| GET | /api/v1/actors/{actorId}/mood/events | List mood events |
| POST | /api/v1/actors/{actorId}/mood/events | Log mood event |
| GET | /api/v1/actors/{actorId}/notes | List Note |
| POST | /api/v1/actors/{actorId}/notes | Create Note |
| DELETE | /api/v1/actors/{actorId}/notes/{entityId} | Delete Note |
| GET | /api/v1/actors/{actorId}/notes/{entityId} | Get Note |
| PUT | /api/v1/actors/{actorId}/notes/{entityId} | Update Note |
| POST | /api/v1/actors/{actorId}/outfit-resolve | Resolve outfit and avatar |
| GET | /api/v1/actors/{actorId}/plan | — |
| GET | /api/v1/actors/{actorId}/position | Get actor position |
| POST | /api/v1/actors/{actorId}/position | Set actor position |
| GET | /api/v1/actors/{actorId}/relationships | List actor relationships |
| POST | /api/v1/actors/{actorId}/relationships | Create actor relationship |
| DELETE | /api/v1/actors/{actorId}/relationships/{targetActorId} | Delete actor relationship |
| GET | /api/v1/actors/{actorId}/relationships/{targetActorId} | Get actor relationship |
| PUT | /api/v1/actors/{actorId}/relationships/{targetActorId} | Update actor relationship |
| POST | /api/v1/actors/{actorId}/relationships/events | Log relationship event |
| GET | /api/v1/actors/{actorId}/systems/export | Export character systems data as JSON |
| POST | /api/v1/actors/{actorId}/systems/export | Export character systems data with filters |
| POST | /api/v1/actors/{actorId}/systems/import | Import character systems data from body |
| POST | /api/v1/actors/{actorId}/systems/import/url | Import character systems data from URL |
| GET | /api/v1/actors/{actorId}/traits | List actor traits |
| POST | /api/v1/actors/{actorId}/traits | Create trait |
| DELETE | /api/v1/actors/{actorId}/traits/{traitName} | Delete trait |
| PUT | /api/v1/actors/{actorId}/traits/{traitName} | Update trait |
| GET | /api/v1/actors/{actorId}/traits/location/{locationId} | List location traits |
| POST | /api/v1/actors/{actorId}/traits/location/{locationId} | Create location trait |
| DELETE | /api/v1/actors/{actorId}/traits/location/{locationId}/{traitName} | Delete location trait |
| GET | /api/v1/actors/{actorId}/traits/world/{worldId} | List world traits |
| POST | /api/v1/actors/{actorId}/traits/world/{worldId} | Create world trait |
| DELETE | /api/v1/actors/{actorId}/traits/world/{worldId}/{traitName} | Delete world trait |
| GET | /api/v1/actors/{actorId}/wardrobe | List wardrobe items |
| POST | /api/v1/actors/{actorId}/wardrobe | Create wardrobe item |
| DELETE | /api/v1/actors/{actorId}/wardrobe/{itemId} | Delete wardrobe item |
| PUT | /api/v1/actors/{actorId}/wardrobe/{itemId} | Update wardrobe item |
| GET | /api/v1/actors/{actorId}/wardrobe/{itemId}/bindings | List outfit bindings |
| POST | /api/v1/actors/{actorId}/wardrobe/{itemId}/bindings | Bind inventory instance to outfit |
| DELETE | /api/v1/actors/{actorId}/wardrobe/{itemId}/bindings/{bindingId} | Unbind inventory instance |
| POST | /api/v1/actors/{actorId}/wardrobe/{itemId}/emotion-avatars | Generate outfit emotion avatars |
| POST | /api/v1/actors/{actorId}/wardrobe/{itemId}/emotion-avatars/single | Generate one outfit emotion avatar |
| DELETE | /api/v1/actors/{actorId}/world-setup/{worldId} | Delete character world setup |
| GET | /api/v1/actors/{actorId}/world-setup/{worldId} | Get character world setup |
| PUT | /api/v1/actors/{actorId}/world-setup/{worldId} | Upsert character world setup |
| GET | /api/v1/actors/{actorId}/world-setup/{worldId}/resolve | Resolve character world setup |
| POST | /api/v1/actors/import | Import a character |
| GET | /api/v1/admin/actors/{actorId}/overrides | List overrides for a specific actor |
| POST | /api/v1/admin/actors/{actorId}/overrides | Create a character override |
| GET | /api/v1/admin/age-gate | — |
| PUT | /api/v1/admin/age-gate | — |
| GET | /api/v1/admin/agent-actions | List RSI agent API actions |
| POST | /api/v1/admin/agent-tokens | Mint an RSI agent token |
| DELETE | /api/v1/admin/agent-tokens/{id} | Revoke an RSI agent token |
| GET | /api/v1/admin/audit | — |
| GET | /api/v1/admin/audit/{id} | — |
| POST | /api/v1/admin/audit/purge | — |
| GET | /api/v1/admin/blender-status | Probe the local Blender binary |
| GET | /api/v1/admin/character-overrides | List all character overrides |
| DELETE | /api/v1/admin/character-overrides/{overrideId} | Delete a character override |
| GET | /api/v1/admin/chats | — |
| DELETE | /api/v1/admin/chats/{id} | — |
| GET | /api/v1/admin/chats/{id} | — |
| PATCH | /api/v1/admin/chats/{id} | — |
| GET | /api/v1/admin/chats/{id}/carriage | — |
| GET | /api/v1/admin/chats/{id}/carriage/debug | — |
| GET | /api/v1/admin/comfyui-workflows | — |
| POST | /api/v1/admin/comfyui-workflows | — |
| DELETE | /api/v1/admin/comfyui-workflows/{id} | — |
| GET | /api/v1/admin/comfyui-workflows/{id} | — |
| PUT | /api/v1/admin/comfyui-workflows/{id} | — |
| POST | /api/v1/admin/comfyui-workflows/{id}/default | — |
| POST | /api/v1/admin/comfyui-workflows/{id}/enabled | — |
| GET | /api/v1/admin/config-schema | — |
| GET | /api/v1/admin/cron/jobs | — |
| POST | /api/v1/admin/cron/jobs/{name}/run | — |
| GET | /api/v1/admin/db/backup | — |
| POST | /api/v1/admin/db/backup | — |
| GET | /api/v1/admin/db/backup/{name} | Download a database backup snapshot |
| POST | /api/v1/admin/db/backup/upload | Upload a database backup snapshot |
| POST | /api/v1/admin/db/restore | — |
| GET | /api/v1/admin/effective-config/export | — |
| POST | /api/v1/admin/factory-reset | — |
| GET | /api/v1/admin/federation/budgets | — |
| PUT | /api/v1/admin/federation/budgets | — |
| DELETE | /api/v1/admin/federation/budgets/{origin}/{workloadClass} | — |
| GET | /api/v1/admin/federation/matrix | — |
| PUT | /api/v1/admin/federation/matrix | — |
| GET | /api/v1/admin/federation/peers | — |
| POST | /api/v1/admin/federation/peers | — |
| DELETE | /api/v1/admin/federation/peers/{origin} | — |
| PATCH | /api/v1/admin/federation/peers/{origin}/workload | — |
| GET | /api/v1/admin/federation/usage | — |
| GET | /api/v1/admin/integration-tokens | — |
| POST | /api/v1/admin/integration-tokens | — |
| DELETE | /api/v1/admin/integration-tokens/{id} | — |
| POST | /api/v1/admin/integrity/recover | Acknowledge integrity recovery |
| GET | /api/v1/admin/integrity/status | Integrity status |
| PATCH | /api/v1/admin/llama-swap/config | — |
| GET | /api/v1/admin/llama-swap/status | — |
| GET | /api/v1/admin/mfa/config | — |
| PATCH | /api/v1/admin/mfa/config | — |
| GET | /api/v1/admin/model-capabilities | — |
| DELETE | /api/v1/admin/model-capabilities/{provider}/{model} | — |
| GET | /api/v1/admin/model-capabilities/{provider}/{model} | — |
| PATCH | /api/v1/admin/model-capabilities/{provider}/{model} | — |
| GET | /api/v1/admin/model-news | — |
| POST | /api/v1/admin/model-news/refresh | — |
| POST | /api/v1/admin/model-news/triage | — |
| GET | /api/v1/admin/model-news/weight-change/{modelId} | — |
| GET | /api/v1/admin/model-roles | — |
| DELETE | /api/v1/admin/model-roles/{role} | — |
| GET | /api/v1/admin/model-roles/{role} | — |
| PUT | /api/v1/admin/model-roles/{role} | — |
| GET | /api/v1/admin/nsfw | — |
| PUT | /api/v1/admin/nsfw | — |
| GET | /api/v1/admin/nsfw/policy | — |
| GET | /api/v1/admin/providers | — |
| GET | /api/v1/admin/providers/{name}/models | — |
| POST | /api/v1/admin/providers/rescan | — |
| POST | /api/v1/admin/resources/backups | — |
| POST | /api/v1/admin/resources/backups/{id}/verify | — |
| GET | /api/v1/admin/resources/inference | — |
| POST | /api/v1/admin/resources/inference | — |
| DELETE | /api/v1/admin/resources/inference/{id} | — |
| POST | /api/v1/admin/resources/inference/{id}/test | — |
| GET | /api/v1/admin/resources/storage | — |
| POST | /api/v1/admin/resources/storage | — |
| DELETE | /api/v1/admin/resources/storage/{id} | — |
| POST | /api/v1/admin/resources/storage/{id}/test | — |
| GET | /api/v1/admin/review/stats | — |
| POST | /api/v1/admin/rotate-expired-keys | — |
| GET | /api/v1/admin/sd-status | — |
| GET | /api/v1/admin/sd-status/comfyui | Probe every ComfyUI instance |
| POST | /api/v1/admin/sd-status/comfyui/setup | Create or update a ComfyUI instance |
| DELETE | /api/v1/admin/sd-status/comfyui/setup/{name} | Delete a ComfyUI instance |
| GET | /api/v1/admin/sd-status/sdcpp | Probe every sd.cpp instance |
| POST | /api/v1/admin/sd-status/sdcpp/setup | Create or update an sd.cpp instance |
| DELETE | /api/v1/admin/sd-status/sdcpp/setup/{name} | Delete an sd.cpp instance |
| GET | /api/v1/admin/sd-templates | — |
| POST | /api/v1/admin/sd-templates | — |
| DELETE | /api/v1/admin/sd-templates/{id} | — |
| PUT | /api/v1/admin/sd-templates/{id} | — |
| POST | /api/v1/admin/seed | — |
| POST | /api/v1/admin/settings/reset | — |
| GET | /api/v1/admin/setup/providers | List stored provider instances |
| POST | /api/v1/admin/setup/providers | Create or update a provider instance |
| DELETE | /api/v1/admin/setup/providers/{name} | Delete a provider instance |
| GET | /api/v1/admin/stats | — |
| GET | /api/v1/admin/system-config | — |
| PATCH | /api/v1/admin/system-config | — |
| DELETE | /api/v1/admin/system-config/{key} | — |
| GET | /api/v1/admin/system-config/export | — |
| POST | /api/v1/admin/system-config/import | — |
| GET | /api/v1/admin/telemetry/aux | — |
| GET | /api/v1/admin/templates | — |
| POST | /api/v1/admin/templates | — |
| DELETE | /api/v1/admin/templates/{id} | — |
| GET | /api/v1/admin/templates/{id} | — |
| PUT | /api/v1/admin/templates/{id} | — |
| PUT | /api/v1/admin/templates/{id}/defaults | — |
| GET | /api/v1/admin/templates/registry | — |
| GET | /api/v1/admin/users | List users |
| DELETE | /api/v1/admin/users/{id} | — |
| GET | /api/v1/admin/users/{id} | Get user |
| PATCH | /api/v1/admin/users/{id}/role | — |
| GET | /api/v1/admin/watchdog/events | List recent watchdog events |
| GET | /api/v1/admin/world-events | — |
| GET | /api/v1/admin/worlds | — |
| DELETE | /api/v1/admin/worlds/{id} | — |
| GET | /api/v1/admin/worlds/{id} | — |
| GET | /api/v1/admin/worlds/{id}/items/power-audit | — |
| POST | /api/v1/age-gate/accept | — |
| GET | /api/v1/age-gate/status | — |
| GET | /api/v1/agency/balance | Read an actor's story point balance |
| POST | /api/v1/agency/earn | Credit story points to an actor |
| POST | /api/v1/agency/spend | Debit story points from an actor |
| POST | /api/v1/agent/check | Stream bun run check over SSE |
| GET | /api/v1/agent/whoami | Identify the presented agent token |
| POST | /api/v1/agent/worktrees | Spawn a TTY-free agent worktree |
| GET | /api/v1/analytics/characters | — |
| GET | /api/v1/analytics/chats/{chatId} | — |
| GET | /api/v1/analytics/comparisons | List recent comparisons |
| POST | /api/v1/analytics/comparisons | Submit a model comparison |
| GET | /api/v1/analytics/comparisons/leaderboard | Get model comparison leaderboard |
| GET | /api/v1/analytics/overview | — |
| GET | /api/v1/analytics/quality | — |
| GET | /api/v1/assets | — |
| DELETE | /api/v1/assets/{id} | — |
| GET | /api/v1/assets/{id} | — |
| PATCH | /api/v1/assets/{id} | — |
| GET | /api/v1/assets/{id}/compressed | — |
| GET | /api/v1/assets/{id}/download | — |
| GET | /api/v1/assets/{id}/links | — |
| POST | /api/v1/assets/{id}/links | — |
| DELETE | /api/v1/assets/{id}/links/{linkId} | — |
| GET | /api/v1/assets/{id}/matte | — |
| POST | /api/v1/assets/{id}/matte | — |
| GET | /api/v1/assets/{id}/matted | — |
| GET | /api/v1/assets/{id}/raw | — |
| DELETE | /api/v1/assets/{id}/share | — |
| POST | /api/v1/assets/{id}/share | — |
| GET | /api/v1/assets/{id}/shares | — |
| POST | /api/v1/assets/{id}/signed-url/{action} | — |
| DELETE | /api/v1/assets/{id}/tag-propositions | Dismiss a proposed tag |
| GET | /api/v1/assets/{id}/tag-propositions | Propose asset tags |
| DELETE | /api/v1/assets/{id}/tags | Remove an asset tag |
| GET | /api/v1/assets/{id}/tags | List asset tags |
| POST | /api/v1/assets/{id}/tags | Add an asset tag |
| POST | /api/v1/assets/{id}/tags/rename | Rename an asset tag |
| GET | /api/v1/assets/{id}/thumb | — |
| GET | /api/v1/assets/{id}/transform | — |
| PUT | /api/v1/assets/{id}/transform | — |
| POST | /api/v1/assets/batch-delete | — |
| POST | /api/v1/assets/batch-download | — |
| POST | /api/v1/assets/download-all | — |
| GET | /api/v1/assets/preferences | — |
| PUT | /api/v1/assets/preferences | — |
| POST | /api/v1/auth/factors | Enroll MFA factor |
| POST | /api/v1/auth/factors/challenge | Issue MFA challenge |
| POST | /api/v1/auth/factors/verify | Verify MFA factor |
| POST | /api/v1/auth/login | Login |
| POST | /api/v1/auth/logout | Logout |
| GET | /api/v1/auth/me | Current user |
| POST | /api/v1/auth/register | Register |
| GET | /api/v1/backgrounds | List chat backgrounds |
| POST | /api/v1/backgrounds | Create chat background |
| POST | /api/v1/battle/equipment/calculate | Calculate equipment modifiers |
| POST | /api/v1/battle/equipment/calculate-from-items | Calculate modifiers from world item IDs |
| POST | /api/v1/battle/equipment/can-equip | Check if item can be equipped |
| POST | /api/v1/battle/equipment/combat-use | Apply combat equipment durability degradation |
| POST | /api/v1/battle/equipment/durability | Apply durability damage |
| POST | /api/v1/battle/equipment/loot | Generate loot from table |
| POST | /api/v1/battle/equipment/repair | Repair item durability |
| POST | /api/v1/battle/morale/apply | Apply morale modifier |
| POST | /api/v1/battle/morale/break | Process morale break |
| POST | /api/v1/battle/morale/compute | Compute morale level |
| POST | /api/v1/battle/npc/decision | NPC combat decision |
| POST | /api/v1/battle/npc/memory | Create battle memory |
| POST | /api/v1/battle/npc/surrender | NPC surrender check |
| POST | /api/v1/battle/resolution/attack | Attack roll |
| POST | /api/v1/battle/resolution/damage | Calculate damage |
| POST | /api/v1/battle/resolution/defense | Defense roll |
| POST | /api/v1/battle/resolution/round | Process combat round |
| POST | /api/v1/battle/social/demoralize | Demoralize enemies |
| POST | /api/v1/battle/social/inspire | Inspire allies |
| POST | /api/v1/battle/social/intimidate | Intimidation check |
| POST | /api/v1/battle/social/rally | Rally allies |
| POST | /api/v1/battle/social/surrender | Surrender check |
| POST | /api/v1/battle/social/taunt | Taunt check |
| POST | /api/v1/battle/weather/hazard | Generate environmental hazard |
| POST | /api/v1/battle/weather/modifiers | Get environmental modifiers |
| POST | /api/v1/battle/weather/visibility | Calculate visibility |
| GET | /api/v1/blog/authors/{authorId}/followers | List author followers |
| PATCH | /api/v1/blog/comments/{id}/moderate | Moderate comment |
| DELETE | /api/v1/blog/follow/{authorId} | Unfollow author |
| POST | /api/v1/blog/follow/{authorId} | Follow author |
| GET | /api/v1/blog/follow/{authorId}/status | Check follow status |
| GET | /api/v1/blog/posts | List blog posts |
| POST | /api/v1/blog/posts | Create blog post |
| DELETE | /api/v1/blog/posts/{id} | Delete blog post |
| GET | /api/v1/blog/posts/{id} | Get blog post |
| PATCH | /api/v1/blog/posts/{id} | Update blog post |
| GET | /api/v1/blog/posts/{id}/comments | List comments on post |
| POST | /api/v1/blog/posts/{id}/comments | Add comment to post |
| GET | /api/v1/blog/posts/{id}/comments/{commentId} | Get a comment by ID with children |
| PATCH | /api/v1/blog/posts/{id}/moderate | Moderate blog post |
| GET | /api/v1/blog/posts/{id}/sources | List RAG sources |
| POST | /api/v1/blog/posts/{id}/sources | Add RAG source |
| GET | /api/v1/capabilities | — |
| GET | /api/v1/character-growth/arc | Get character arc + growth mode |
| PATCH | /api/v1/character-growth/arc | Set character arc stage |
| GET | /api/v1/character-growth/growth-log | List growth log entries |
| POST | /api/v1/character-growth/growth-log/{entryId}/confirm | Confirm a pending growth_log entry |
| POST | /api/v1/character-growth/growth-log/{entryId}/reject | Reject a pending growth_log entry |
| DELETE | /api/v1/character-internal-traits | Delete character internal traits |
| GET | /api/v1/character-internal-traits | Get character internal traits |
| PUT | /api/v1/character-internal-traits | Create or update character internal traits |
| GET | /api/v1/character-internal-traits/prompt | Get prompt assembly section for internal traits |
| POST | /api/v1/characters/{id}/approve | Approve character |
| POST | /api/v1/characters/{id}/reject | Reject character |
| POST | /api/v1/characters/{id}/submit-for-review | Submit character for review |
| GET | /api/v1/characters/pending-reviews | List pending character reviews |
| GET | /api/v1/chat-setup-templates | — |
| POST | /api/v1/chat-setup-templates | — |
| DELETE | /api/v1/chat-setup-templates/{templateId} | — |
| PUT | /api/v1/chat-setup-templates/{templateId} | — |
| GET | /api/v1/chats | — |
| POST | /api/v1/chats | — |
| DELETE | /api/v1/chats/{id} | — |
| GET | /api/v1/chats/{id} | — |
| PUT | /api/v1/chats/{id} | — |
| PATCH | /api/v1/chats/{id}/active-branch | — |
| GET | /api/v1/chats/{id}/annotations | — |
| POST | /api/v1/chats/{id}/annotations | — |
| POST | /api/v1/chats/{id}/archive | — |
| DELETE | /api/v1/chats/{id}/auto-translate | — |
| PATCH | /api/v1/chats/{id}/auto-translate | — |
| DELETE | /api/v1/chats/{id}/background | Remove chat background |
| GET | /api/v1/chats/{id}/background | Get chat background |
| POST | /api/v1/chats/{id}/background | Set chat background |
| POST | /api/v1/chats/{id}/branch-merges | Initiate a conversation content merge |
| POST | /api/v1/chats/{id}/branch-merges/{mergeId}/confirm | Confirm a merge and materialise the result |
| POST | /api/v1/chats/{id}/branch-merges/{mergeId}/continue | Continue from a confirmed merge |
| POST | /api/v1/chats/{id}/branch-merges/{mergeId}/preview | Build a merge preview |
| GET | /api/v1/chats/{id}/branches | — |
| POST | /api/v1/chats/{id}/branches | — |
| DELETE | /api/v1/chats/{id}/branches/{branchId} | Delete a chat branch |
| GET | /api/v1/chats/{id}/branches/{branchId} | Get chat branch detail |
| PATCH | /api/v1/chats/{id}/branches/{branchId} | Rename or activate a chat branch |
| POST | /api/v1/chats/{id}/branches/{branchId}/merge | Merge a chat branch |
| GET | /api/v1/chats/{id}/classifier-tags | — |
| PUT | /api/v1/chats/{id}/classifier-tags | — |
| GET | /api/v1/chats/{id}/context | — |
| POST | /api/v1/chats/{id}/create-entity | — |
| GET | /api/v1/chats/{id}/encryption-key | Get chat encryption key |
| GET | /api/v1/chats/{id}/entity-suggestions | — |
| GET | /api/v1/chats/{id}/export | Export chat in requested format |
| POST | /api/v1/chats/{id}/fork | — |
| GET | /api/v1/chats/{id}/game-state | Get latest game state |
| GET | /api/v1/chats/{id}/game-states | List game states |
| POST | /api/v1/chats/{id}/generate-entity | — |
| PUT | /api/v1/chats/{id}/gm-guidance | — |
| POST | /api/v1/chats/{id}/gm/escalate | — |
| PUT | /api/v1/chats/{id}/impersonate | — |
| GET | /api/v1/chats/{id}/invites | — |
| POST | /api/v1/chats/{id}/invites | — |
| DELETE | /api/v1/chats/{id}/invites/{inviteId} | — |
| POST | /api/v1/chats/{id}/join | — |
| GET | /api/v1/chats/{id}/link-preview | Unfurl a generic link preview |
| PUT | /api/v1/chats/{id}/location | — |
| PUT | /api/v1/chats/{id}/mark-read | — |
| GET | /api/v1/chats/{id}/messages | List messages |
| POST | /api/v1/chats/{id}/messages | — |
| POST | /api/v1/chats/{id}/messages/{messageId}/ai-action | — |
| POST | /api/v1/chats/{id}/messages/{messageId}/forward | — |
| POST | /api/v1/chats/{id}/messages/{messageId}/section | Assign a message to a section |
| POST | /api/v1/chats/{id}/messages/bulk/delete | — |
| POST | /api/v1/chats/{id}/messages/bulk/export | — |
| POST | /api/v1/chats/{id}/messages/bulk/section | — |
| POST | /api/v1/chats/{id}/messages/purge | — |
| POST | /api/v1/chats/{id}/migrate | — |
| POST | /api/v1/chats/{id}/moderate | — |
| GET | /api/v1/chats/{id}/music-links | List music links in a chat |
| POST | /api/v1/chats/{id}/music-links | Share a music link |
| GET | /api/v1/chats/{id}/owners | — |
| POST | /api/v1/chats/{id}/owners | — |
| DELETE | /api/v1/chats/{id}/owners/{userId} | — |
| GET | /api/v1/chats/{id}/participants | — |
| POST | /api/v1/chats/{id}/participants | — |
| DELETE | /api/v1/chats/{id}/participants/{actorId} | — |
| PUT | /api/v1/chats/{id}/participants/{actorId} | — |
| PUT | /api/v1/chats/{id}/persona | — |
| GET | /api/v1/chats/{id}/pins | List pinned messages in a chat |
| POST | /api/v1/chats/{id}/pins | Pin a message in a chat |
| DELETE | /api/v1/chats/{id}/pins/{pinId} | Unpin a message from a chat |
| GET | /api/v1/chats/{id}/polls | List all polls in a chat |
| GET | /api/v1/chats/{id}/prompt-template | — |
| DELETE | /api/v1/chats/{id}/purge | — |
| GET | /api/v1/chats/{id}/questions | List open RPG questions for a chat |
| POST | /api/v1/chats/{id}/questions | Create an RPG question |
| POST | /api/v1/chats/{id}/rename | — |
| POST | /api/v1/chats/{id}/reunite | — |
| GET | /api/v1/chats/{id}/scheduled | List scheduled messages |
| POST | /api/v1/chats/{id}/scheduled | Schedule a message |
| DELETE | /api/v1/chats/{id}/scheduled/{scheduledId} | Cancel a scheduled message |
| GET | /api/v1/chats/{id}/sections | List chat sections |
| POST | /api/v1/chats/{id}/sections | Create chat section |
| DELETE | /api/v1/chats/{id}/sections/{sectionId} | Delete chat section |
| PATCH | /api/v1/chats/{id}/sections/{sectionId} | Update chat section |
| POST | /api/v1/chats/{id}/sections/{sectionId}/assign-all | Bulk assign messages to a section |
| POST | /api/v1/chats/{id}/sections/{sectionId}/narrative | Insert a narrative message for a section |
| POST | /api/v1/chats/{id}/sections/reorder | Reorder chat sections |
| GET | /api/v1/chats/{id}/shadow-notes | — |
| POST | /api/v1/chats/{id}/shadow-notes | — |
| DELETE | /api/v1/chats/{id}/shadow-notes/{noteId} | — |
| POST | /api/v1/chats/{id}/shadow-notes/{noteId}/reveal | — |
| GET | /api/v1/chats/{id}/side | — |
| POST | /api/v1/chats/{id}/side | — |
| POST | /api/v1/chats/{id}/split | — |
| GET | /api/v1/chats/{id}/story-turns | List story turns for a chat |
| GET | /api/v1/chats/{id}/story-turns/{turnId} | Get a single story turn |
| POST | /api/v1/chats/{id}/story/configure | — |
| POST | /api/v1/chats/{id}/story/narration | — |
| POST | /api/v1/chats/{id}/story/pause | — |
| POST | /api/v1/chats/{id}/story/resume | — |
| GET | /api/v1/chats/{id}/story/state | — |
| POST | /api/v1/chats/{id}/story/step | — |
| POST | /api/v1/chats/{id}/transfer | — |
| POST | /api/v1/chats/{id}/transfer-ownership | — |
| GET | /api/v1/chats/{id}/turn-order | — |
| POST | /api/v1/chats/{id}/turn-skip | — |
| POST | /api/v1/chats/{id}/unarchive | — |
| GET | /api/v1/chats/{id}/vn-choices | — |
| POST | /api/v1/chats/{id}/vn-choices/{choiceId}/dismiss | — |
| POST | /api/v1/chats/{id}/vn-choices/{choiceId}/select | — |
| POST | /api/v1/chats/{id}/vn-choices/custom | — |
| GET | /api/v1/chats/{id}/vn-questions | — |
| POST | /api/v1/chats/{id}/vn-questions/{questionId}/answer | — |
| POST | /api/v1/chats/{id}/vn-questions/{questionId}/dismiss | — |
| POST | /api/v1/chats/{id}/vn/generate-choices | — |
| POST | /api/v1/chats/{id}/vn/generate-questions | — |
| POST | /api/v1/chats/{id}/vn/generate-story | — |
| POST | /api/v1/chats/{id}/voice-notes | Upload a chat voice note |
| PUT | /api/v1/chats/{id}/wardrobe-override | Set chat outfit override |
| GET | /api/v1/chats/{id}/wardrobe-override/{actorId} | Get chat outfit override |
| GET | /api/v1/chats/{id}/whitenotes | — |
| POST | /api/v1/chats/{id}/whitenotes | — |
| DELETE | /api/v1/chats/{id}/whitenotes/{noteId} | — |
| GET | /api/v1/chats/activity | Get per-chat activity summary |
| POST | /api/v1/chats/batch/archive | — |
| POST | /api/v1/chats/batch/delete | — |
| POST | /api/v1/chats/batch/export | — |
| GET | /api/v1/chats/filters | Get the caller's saved chat-list filter snapshot |
| PUT | /api/v1/chats/filters | Replace the caller's saved chat-list filter snapshot |
| GET | /api/v1/chats/joinable | — |
| GET | /api/v1/comfyui-builder/chains | List builder chains |
| POST | /api/v1/comfyui-builder/chains | Create a builder chain |
| DELETE | /api/v1/comfyui-builder/chains/{id} | Delete a builder chain |
| GET | /api/v1/comfyui-builder/chains/{id} | Retrieve a builder chain |
| PATCH | /api/v1/comfyui-builder/chains/{id} | Update a builder chain |
| GET | /api/v1/comfyui-builder/palette | Proxy the ComfyUI node palette |
| POST | /api/v1/comfyui-builder/runs | Start a builder chain run |
| GET | /api/v1/comfyui-builder/runs/{jobId} | Poll a builder chain run |
| POST | /api/v1/comfyui-builder/validate | Statically validate a ComfyUI graph |
| GET | /api/v1/comfyui/models | — |
| GET | /api/v1/commands | List registered chat commands |
| GET | /api/v1/comparisons | — |
| GET | /api/v1/comparisons/{id}/export | Export a model comparison |
| POST | /api/v1/comparisons/{id}/rating | — |
| GET | /api/v1/config-menu | — |
| PATCH | /api/v1/config-menu | — |
| POST | /api/v1/demo-login | Demo login |
| GET | /api/v1/emoji | List emoji shortcodes |
| GET | /api/v1/emotions | List emotion definitions |
| POST | /api/v1/emotions | Create emotion definition |
| GET | /api/v1/emotions/prompt-modifier/{emotion} | — |
| GET | /api/v1/emotions/types | — |
| GET | /api/v1/encryption/status | Get encryption status |
| POST | /api/v1/export | Export data as ZIP archive |
| GET | /api/v1/export/download/{jobId} | Download export |
| POST | /api/v1/export/progress | Start export with SSE progress |
| GET | /api/v1/export/status/{jobId} | Get export job status |
| POST | /api/v1/frontend/logs | Ingest frontend logs |
| GET | /api/v1/generation/active | — |
| POST | /api/v1/generation/audio | Generate an audio track from a prompt |
| POST | /api/v1/generation/audio/ambient | — |
| POST | /api/v1/generation/cancel | — |
| POST | /api/v1/generation/caption | — |
| POST | /api/v1/generation/compare | Run parallel model A/B generation |
| POST | /api/v1/generation/continue | — |
| POST | /api/v1/generation/generate | — |
| POST | /api/v1/generation/image | — |
| POST | /api/v1/generation/prompt | — |
| GET | /api/v1/generation/quota-state | — |
| POST | /api/v1/generation/quota/override | — |
| POST | /api/v1/generation/regenerate | — |
| POST | /api/v1/generation/retry | — |
| GET | /api/v1/generation/status/{chatId} | — |
| GET | /api/v1/generation/stream/{chatId} | — |
| POST | /api/v1/generation/test-connection | — |
| POST | /api/v1/generation/video | Submit a video generation job |
| GET | /api/v1/generation/video/status/{jobId} | Poll a video generation job |
| GET | /api/v1/gifs/search | — |
| GET | /api/v1/harness/escalations | — |
| POST | /api/v1/harness/escalations/{id}/approve | — |
| POST | /api/v1/harness/escalations/{id}/deny | — |
| GET | /api/v1/harness/ledger | — |
| GET | /api/v1/harness/metrics | Harness metrics (Prometheus) |
| GET | /api/v1/harness/models | — |
| GET | /api/v1/harness/permissions | — |
| POST | /api/v1/harness/permissions/{id}/approve | — |
| POST | /api/v1/harness/permissions/{id}/deny | — |
| GET | /api/v1/harness/queue | — |
| POST | /api/v1/harness/queue | — |
| POST | /api/v1/harness/queue/turns/{id}/cancel | — |
| GET | /api/v1/harness/reports | List tooling failure reports |
| POST | /api/v1/harness/reports | Store a tooling failure report |
| GET | /api/v1/harness/runs | — |
| GET | /api/v1/harness/runs/{runId} | — |
| GET | /api/v1/harness/runs/{runId}/files | — |
| GET | /api/v1/harness/settings | — |
| PUT | /api/v1/harness/settings | — |
| GET | /api/v1/harness/stats | — |
| GET | /api/v1/harness/stream | Stream harness exec-log and job status via SSE |
| GET | /api/v1/harness/usage | — |
| GET | /api/v1/health | Health check |
| PATCH | /api/v1/i18n/locale | Set user locale |
| GET | /api/v1/i18n/locales | List supported locales |
| GET | /api/v1/image-edit/capabilities | — |
| GET | /api/v1/image-edit/health | — |
| GET | /api/v1/image-edit/nodes | — |
| POST | /api/v1/image-edit/run | Run a workflow template |
| GET | /api/v1/image-edit/templates | — |
| POST | /api/v1/import/world | Import a world bundle |
| POST | /api/v1/integrations/{opName} | — |
| GET | /api/v1/integrations/manifest | — |
| GET | /api/v1/integrations/mcp | — |
| POST | /api/v1/integrations/mcp | — |
| DELETE | /api/v1/integrations/mcp/streamable | — |
| GET | /api/v1/integrations/mcp/streamable | — |
| POST | /api/v1/integrations/mcp/streamable | — |
| POST | /api/v1/integrations/webhooks/{adapter} | — |
| POST | /api/v1/invites/{code}/join | — |
| DELETE | /api/v1/ivss/fragments/{id} | — |
| PATCH | /api/v1/ivss/fragments/{id} | — |
| POST | /api/v1/ivss/fragments/{id}/run | — |
| POST | /api/v1/ivss/reorder | — |
| GET | /api/v1/ivss/scenarios | — |
| POST | /api/v1/ivss/scenarios | — |
| GET | /api/v1/ivss/scenarios/{id} | — |
| GET | /api/v1/ivss/scenarios/{id}/assemblies | — |
| GET | /api/v1/ivss/scenarios/{id}/assembly | — |
| POST | /api/v1/ivss/scenarios/{id}/assembly | — |
| POST | /api/v1/ivss/scenarios/{id}/scenes | — |
| DELETE | /api/v1/ivss/scenes/{id} | — |
| PATCH | /api/v1/ivss/scenes/{id} | — |
| POST | /api/v1/ivss/scenes/{id}/fragments | — |
| POST | /api/v1/ivss/scenes/{id}/shots | — |
| DELETE | /api/v1/ivss/shots/{id} | — |
| PATCH | /api/v1/ivss/shots/{id} | — |
| GET | /api/v1/keys | List actor encryption keys |
| POST | /api/v1/keys | Generate a new named encryption key |
| DELETE | /api/v1/keys/{id} | Revoke an encryption key |
| POST | /api/v1/keys/rotate | Rotate the primary encryption key |
| GET | /api/v1/local-inference/capability | Browser inference capability |
| GET | /api/v1/local-inference/manifest | Browser inference manifest |
| GET | /api/v1/locations/{id}/state | Get location state |
| PUT | /api/v1/locations/{id}/state | Update location state |
| POST | /api/v1/lora/clear | Clear LoRA discovery cache |
| POST | /api/v1/lora/discover | Discover LoRA models from a backend |
| GET | /api/v1/lora/list | List cached LoRA models |
| GET | /api/v1/lora/status | Get LoRA discovery cache status |
| POST | /api/v1/lora/validate | Validate LoRA configuration |
| GET | /api/v1/memory/knowledge-graph | — |
| DELETE | /api/v1/messages/{id} | — |
| GET | /api/v1/messages/{id} | — |
| PATCH | /api/v1/messages/{id} | — |
| POST | /api/v1/messages/{id}/archive | — |
| POST | /api/v1/messages/{id}/attachments | — |
| GET | /api/v1/messages/{id}/poll | Read a message poll |
| POST | /api/v1/messages/{id}/poll | Create the poll attached to a message |
| POST | /api/v1/messages/{id}/poll/close | Close a message poll |
| POST | /api/v1/messages/{id}/poll/vote | Vote on a message poll |
| DELETE | /api/v1/messages/{id}/reactions | Remove all user reactions from a message |
| GET | /api/v1/messages/{id}/reactions | Get grouped reactions for a message |
| POST | /api/v1/messages/{id}/reactions | Toggle a reaction on a message |
| POST | /api/v1/messages/{id}/restore | — |
| DELETE | /api/v1/messages/{id}/seen | Remove actor's seen record from a message |
| GET | /api/v1/messages/{id}/seen | Get grouped seen-state viewers for a message |
| POST | /api/v1/messages/{id}/seen | Record or clear seen-state for an actor on a message |
| PUT | /api/v1/messages/{id}/status | — |
| GET | /api/v1/messages/{id}/translations | List message translations |
| POST | /api/v1/messages/{id}/translations | Translate a message on demand |
| GET | /api/v1/messages/{id}/translations/{locale} | — |
| GET | /api/v1/messages/{id}/variant | — |
| GET | /api/v1/messages/{id}/variants | — |
| PUT | /api/v1/messages/{id}/visibility | — |
| GET | /api/v1/messages/quick-emojis | Get available quick emoji list |
| POST | /api/v1/messages/regenerate | — |
| GET | /api/v1/metrics | — |
| DELETE | /api/v1/music-links/{id} | Delete a music link |
| GET | /api/v1/notifications | List notifications |
| DELETE | /api/v1/notifications/{id} | Delete notification |
| PATCH | /api/v1/notifications/{id} | Mark notification read |
| GET | /api/v1/notifications/preferences | Get notification preferences |
| PATCH | /api/v1/notifications/preferences | Update notification preferences |
| PATCH | /api/v1/notifications/read-all | Mark all notifications read |
| GET | /api/v1/notifications/stream | Notification SSE stream |
| GET | /api/v1/notifications/unread-count | Get unread count |
| GET | /api/v1/npc-movement/events | Get movement events for a chat |
| POST | /api/v1/npc-movement/events | Store movement events in message metadata |
| GET | /api/v1/npc-movement/recent/{chatId} | Get recent movement events for display |
| GET | /api/v1/nsfw/arousal/{actorId} | — |
| POST | /api/v1/nsfw/arousal/{actorId} | — |
| GET | /api/v1/nsfw/body/{actorId} | — |
| PUT | /api/v1/nsfw/body/{actorId} | — |
| POST | /api/v1/nsfw/consent | — |
| GET | /api/v1/nsfw/desire/{actorId} | — |
| PUT | /api/v1/nsfw/desire/{actorId} | — |
| POST | /api/v1/nsfw/encounters | — |
| GET | /api/v1/nsfw/encounters/{id} | — |
| POST | /api/v1/nsfw/encounters/{id}/advance | — |
| GET | /api/v1/nsfw/encounters/world/{worldId} | — |
| POST | /api/v1/nsfw/fantasies | — |
| GET | /api/v1/nsfw/fantasies/{actorId} | — |
| POST | /api/v1/nsfw/fantasies/{id}/explore | — |
| POST | /api/v1/nsfw/fantasies/discover | — |
| GET | /api/v1/nsfw/intimacy/{actorId} | — |
| GET | /api/v1/nsfw/intimacy/{actorId}/{targetId} | — |
| POST | /api/v1/nsfw/intimacy/action | — |
| GET | /api/v1/nsfw/location/{locationId} | — |
| PUT | /api/v1/nsfw/location/{locationId} | — |
| POST | /api/v1/nsfw/moderation/appeals | — |
| POST | /api/v1/nsfw/moderation/appeals/{id}/execute | — |
| PUT | /api/v1/nsfw/moderation/appeals/{id}/review | — |
| GET | /api/v1/nsfw/moderation/appeals/me | — |
| GET | /api/v1/nsfw/moderation/appeals/pending | — |
| GET | /api/v1/nsfw/moderation/audit/{userId} | — |
| POST | /api/v1/nsfw/moderation/ban | — |
| POST | /api/v1/nsfw/moderation/block | — |
| PUT | /api/v1/nsfw/moderation/chat/{chatId} | — |
| GET | /api/v1/nsfw/moderation/effective/{chatId} | — |
| DELETE | /api/v1/nsfw/moderation/export/{userId} | — |
| GET | /api/v1/nsfw/moderation/export/{userId} | — |
| GET | /api/v1/nsfw/moderation/flags | — |
| POST | /api/v1/nsfw/moderation/flags | — |
| PUT | /api/v1/nsfw/moderation/flags/{id} | — |
| GET | /api/v1/nsfw/moderation/preferences/{userId} | — |
| PUT | /api/v1/nsfw/moderation/preferences/{userId} | — |
| POST | /api/v1/nsfw/moderation/shadow | — |
| POST | /api/v1/nsfw/moderation/unban | — |
| POST | /api/v1/nsfw/moderation/unblock | — |
| POST | /api/v1/nsfw/moderation/unshadow | — |
| PUT | /api/v1/nsfw/moderation/world/{worldId} | — |
| POST | /api/v1/nsfw/seduction/attempt | — |
| GET | /api/v1/nsfw/skills/{actorId} | — |
| GET | /api/v1/openapi/changelog | List OpenAPI contract changes (reserved) |
| POST | /api/v1/openapi/diff | Diff two OpenAPI documents (reserved) |
| POST | /api/v1/openapi/validate | Validate an OpenAPI document (reserved) |
| GET | /api/v1/personas | — |
| POST | /api/v1/personas | — |
| DELETE | /api/v1/personas/{id} | — |
| GET | /api/v1/personas/{id} | — |
| PATCH | /api/v1/personas/{id} | — |
| POST | /api/v1/personas/{id}/convert-to-character | — |
| GET | /api/v1/planning/kanban | — |
| GET | /api/v1/plans | — |
| POST | /api/v1/plans | — |
| DELETE | /api/v1/plans/{id} | — |
| GET | /api/v1/plans/{id} | — |
| PATCH | /api/v1/plans/{id} | — |
| POST | /api/v1/plans/{id}/advance | — |
| GET | /api/v1/plans/{id}/links | — |
| POST | /api/v1/plans/{id}/links | — |
| GET | /api/v1/plugins | List plugins |
| DELETE | /api/v1/plugins/{name} | Uninstall plugin |
| GET | /api/v1/plugins/{name}/config | Get plugin config |
| PUT | /api/v1/plugins/{name}/config | Set plugin config |
| POST | /api/v1/plugins/{name}/disable | Disable plugin |
| POST | /api/v1/plugins/{name}/enable | Enable plugin |
| GET | /api/v1/plugins/discover | Discover plugins |
| POST | /api/v1/plugins/install | Install plugin |
| GET | /api/v1/plugins/ui-components | List UI components |
| POST | /api/v1/proactive-messaging/backoff | Increment proactive messaging backoff |
| GET | /api/v1/proactive-messaging/check | Check if proactive message should be sent |
| DELETE | /api/v1/proactive-messaging/config | Delete proactive messaging config |
| GET | /api/v1/proactive-messaging/config | Get proactive messaging config |
| PUT | /api/v1/proactive-messaging/config | Create or update proactive messaging config |
| GET | /api/v1/proactive-messaging/configs | List proactive messaging configs |
| POST | /api/v1/proactive-messaging/record-sent | Record proactive message sent |
| POST | /api/v1/proactive-messaging/reset-backoff | Reset proactive messaging backoff |
| POST | /api/v1/proactive-messaging/send | Send a proactive message |
| GET | /api/v1/providers | List active providers |
| POST | /api/v1/questions/{id}/answer | Answer an RPG question |
| DELETE | /api/v1/quests/{id} | Abandon quest |
| GET | /api/v1/quests/{id} | Get quest |
| PUT | /api/v1/quests/{id} | Update quest |
| POST | /api/v1/quests/{id}/progress | Update quest progress |
| GET | /api/v1/quests/{id}/progress/{chatId} | Get quest progress by chat |
| GET | /api/v1/rate-limit/status | — |
| GET | /api/v1/reminders | List message reminders |
| POST | /api/v1/reminders | Create a message reminder |
| DELETE | /api/v1/reminders/{id} | Cancel a message reminder |
| GET | /api/v1/requests/{id}/status | — |
| GET | /api/v1/rpg/achievements | List achievements |
| POST | /api/v1/rpg/achievements | Create achievement |
| DELETE | /api/v1/rpg/achievements/{id} | Delete achievement |
| GET | /api/v1/rpg/achievements/{id} | Get achievement |
| PUT | /api/v1/rpg/achievements/{id} | Update achievement |
| GET | /api/v1/rpg/achievements/player/{playerId} | List player achievements |
| GET | /api/v1/rpg/achievements/player/{playerId}/{achievementId} | Get player achievement progress |
| POST | /api/v1/rpg/achievements/player/{playerId}/{achievementId}/claim | Claim achievement rewards |
| POST | /api/v1/rpg/achievements/player/{playerId}/{achievementId}/progress | Update achievement progress |
| GET | /api/v1/rpg/achievements/player/{playerId}/stats | Get player achievement stats |
| POST | /api/v1/rpg/bestiary/worlds/{worldId}/despawn-expired | Despawn expired monsters |
| GET | /api/v1/rpg/bestiary/worlds/{worldId}/locations/{locationId}/monsters | List monsters at a location |
| GET | /api/v1/rpg/bestiary/worlds/{worldId}/monsters | List monster templates |
| POST | /api/v1/rpg/bestiary/worlds/{worldId}/monsters | Register a monster template |
| POST | /api/v1/rpg/bestiary/worlds/{worldId}/spawns | Spawn a monster |
| POST | /api/v1/rpg/combat/action | Check/consume an action |
| POST | /api/v1/rpg/combat/attack | Resolve an attack roll |
| POST | /api/v1/rpg/combat/damage | Apply damage |
| POST | /api/v1/rpg/combat/heal | Heal a combatant |
| POST | /api/v1/rpg/combat/init-combatant | Initialize a combatant |
| POST | /api/v1/rpg/combat/initiative | Roll initiative |
| POST | /api/v1/rpg/combat/reset-round | Reset round reactions |
| POST | /api/v1/rpg/combat/reset-turn | Reset turn actions |
| POST | /api/v1/rpg/combat/save | Make a saving throw |
| POST | /api/v1/rpg/combat/status | Evaluate combat status |
| POST | /api/v1/rpg/craft | Attempt a craft |
| GET | /api/v1/rpg/crafting/station-instances | List station instances |
| POST | /api/v1/rpg/crafting/station-instances | Create station instance |
| DELETE | /api/v1/rpg/crafting/station-instances/{id} | Delete station instance |
| PATCH | /api/v1/rpg/crafting/station-instances/{id} | Update station instance |
| GET | /api/v1/rpg/crafting/stations | List station definitions |
| POST | /api/v1/rpg/crafting/stations | Create station definition |
| DELETE | /api/v1/rpg/crafting/stations/{id} | Delete station definition |
| GET | /api/v1/rpg/crafting/stations/{id} | Get station definition |
| PATCH | /api/v1/rpg/crafting/stations/{id} | Update station definition |
| POST | /api/v1/rpg/dice/advantage | Roll d20 with advantage/disadvantage |
| POST | /api/v1/rpg/dice/notation | Roll from dice notation |
| POST | /api/v1/rpg/dice/roll | Roll dice with crypto entropy |
| POST | /api/v1/rpg/loot/generate | Generate loot |
| POST | /api/v1/rpg/loot/persist | Persist loot |
| POST | /api/v1/rpg/loot/tables | Create loot table |
| POST | /api/v1/rpg/loot/tables/{id}/entries | Add loot entry |
| POST | /api/v1/rpg/loot/tables/{id}/roll | Roll loot table |
| POST | /api/v1/rpg/npc-memory/worlds/{worldId}/decay | Run the NPC memory decay sweep |
| POST | /api/v1/rpg/npc-memory/worlds/{worldId}/memories/{memoryId}/reinforce | Reinforce an NPC memory |
| GET | /api/v1/rpg/npc-memory/worlds/{worldId}/npcs/{npcId}/memories | Recall NPC memories |
| POST | /api/v1/rpg/npc-memory/worlds/{worldId}/npcs/{npcId}/memories | Record an NPC memory |
| POST | /api/v1/rpg/npc-memory/worlds/{worldId}/relationships | Update an NPC relationship |
| POST | /api/v1/rpg/npc-navigation/actors/{actorId}/move | Move NPC to location |
| POST | /api/v1/rpg/npc-navigation/actors/{actorId}/pattern | Set NPC movement pattern |
| GET | /api/v1/rpg/npc-navigation/actors/{actorId}/state | Get NPC movement state |
| PUT | /api/v1/rpg/npc-navigation/actors/{actorId}/state | Update NPC movement state |
| POST | /api/v1/rpg/npc-navigation/worlds/{worldId}/tick | Process NPC movement tick |
| POST | /api/v1/rpg/professions | Assign profession |
| GET | /api/v1/rpg/professions/{id} | Get profession |
| POST | /api/v1/rpg/professions/{id}/specialize | Specialize profession |
| POST | /api/v1/rpg/professions/{id}/xp | Add profession XP |
| GET | /api/v1/rpg/professions/actors/{actorId} | List actor professions |
| GET | /api/v1/rpg/progression/{actorId} | Get progression state |
| POST | /api/v1/rpg/progression/{actorId}/asi | Allocate ASI points |
| POST | /api/v1/rpg/progression/{actorId}/award | Award XP |
| POST | /api/v1/rpg/progression/{actorId}/level-up | Resolve level-up decision |
| POST | /api/v1/rpg/replayability/new-game-plus | Start new game plus |
| GET | /api/v1/rpg/replayability/players/{playerId}/meta | Get meta-progression |
| GET | /api/v1/rpg/replayability/players/{playerId}/playthroughs | List player playthroughs |
| POST | /api/v1/rpg/replayability/playthroughs | Start playthrough |
| GET | /api/v1/rpg/replayability/playthroughs/{id} | Get playthrough |
| POST | /api/v1/rpg/replayability/playthroughs/{id}/choice | Record playthrough choice |
| POST | /api/v1/rpg/replayability/playthroughs/{id}/complete | Complete playthrough |
| POST | /api/v1/rpg/replayability/playthroughs/{id}/secret | Record secret found |
| GET | /api/v1/rpg/skills | List skills |
| POST | /api/v1/rpg/skills | Create skill |
| DELETE | /api/v1/rpg/skills/{id} | Delete skill |
| GET | /api/v1/rpg/skills/{id} | Get skill |
| PUT | /api/v1/rpg/skills/{id} | Update skill |
| POST | /api/v1/rpg/skills/{id}/specialize | Specialize skill |
| POST | /api/v1/rpg/skills/{id}/xp | Add skill XP |
| GET | /api/v1/rpg/skills/actors/{actorId} | Get actor skills |
| GET | /api/v1/rpg/skills/actors/{actorId}/category/{category} | Get actor skills by category |
| GET | /api/v1/rpg/skills/actors/{actorId}/tree | Build actor skill tree |
| POST | /api/v1/rpg/skills/prerequisites/check | Check skill prerequisites |
| GET | /api/v1/rpg/stat-allocation/{actorId} | Get stat allocation |
| PUT | /api/v1/rpg/stat-allocation/{actorId} | Put stat allocation |
| GET | /api/v1/rpg/stat-config | Get stat config |
| GET | /api/v1/rpg/stats/{actorId} | Get character stats |
| PATCH | /api/v1/rpg/stats/{actorId} | Update character stats |
| POST | /api/v1/rpg/stats/{actorId} | Create character stats |
| POST | /api/v1/rpg/stats/calculate | Compute ability modifiers |
| POST | /api/v1/rpg/stats/generate | Generate stat block |
| POST | /api/v1/rpg/stats/validate | Validate a stat block |
| GET | /api/v1/rpg/trait-catalog | List gameplay traits |
| GET | /api/v1/rpg/world-location-traits/actors/{actorId} | Get all traits for actor |
| DELETE | /api/v1/rpg/world-location-traits/location/{id} | Delete location trait |
| PUT | /api/v1/rpg/world-location-traits/location/{id} | Update location trait |
| GET | /api/v1/rpg/world-location-traits/locations/{locationId} | List location traits |
| POST | /api/v1/rpg/world-location-traits/locations/{locationId} | Create location trait |
| DELETE | /api/v1/rpg/world-location-traits/world/{id} | Delete world trait |
| PUT | /api/v1/rpg/world-location-traits/world/{id} | Update world trait |
| GET | /api/v1/rpg/world-location-traits/worlds/{worldId} | List world traits |
| POST | /api/v1/rpg/world-location-traits/worlds/{worldId} | Create world trait |
| POST | /api/v1/rpg/xp/award | Award XP |
| GET | /api/v1/rpg/xp/history | Get XP history |
| POST | /api/v1/rpg/xp/level | Compute level from XP |
| POST | /api/v1/rpg/xp/next | XP to next level |
| GET | /api/v1/search | Unified search |
| GET | /api/v1/sessions | List sessions |
| DELETE | /api/v1/sessions/{id} | Delete session |
| GET | /api/v1/sessions/{id} | Get session |
| POST | /api/v1/sessions/{id}/switch | Switch session |
| GET | /api/v1/settings | Get settings |
| PATCH | /api/v1/settings | Update settings |
| POST | /api/v1/settings/backups/{id}/restore | — |
| GET | /api/v1/settings/backups/hashes | — |
| GET | /api/v1/settings/export | Export settings |
| GET | /api/v1/setup/state | Setup state |
| GET | /api/v1/tag-autocomplete | Tag autocomplete vocabulary |
| GET | /api/v1/tasks | List offload tasks (reserved) |
| GET | /api/v1/tasks/{id} | Get an offload task (reserved) |
| POST | /api/v1/tasks/{id}/cancel | Cancel an offload task (reserved) |
| GET | /api/v1/telemetry/analytics/daily | Get daily analytics |
| GET | /api/v1/telemetry/analytics/errors | Get error analytics |
| GET | /api/v1/telemetry/analytics/models | Get model analytics |
| DELETE | /api/v1/telemetry/analytics/purge | Purge old telemetry |
| GET | /api/v1/telemetry/analytics/summary | Get summary analytics |
| POST | /api/v1/telemetry/event | Record telemetry event |
| GET | /api/v1/templates | List prompt templates |
| POST | /api/v1/templates | Create a prompt template |
| DELETE | /api/v1/templates/{id} | Delete a prompt template |
| GET | /api/v1/templates/{id} | Retrieve a prompt template |
| PATCH | /api/v1/templates/{id} | Update a prompt template |
| POST | /api/v1/templates/{id}/apply | Render a prompt template |
| GET | /api/v1/templates/audio | List audio templates |
| POST | /api/v1/templates/audio | Create a audio template |
| DELETE | /api/v1/templates/audio/{id} | Delete a audio template |
| GET | /api/v1/templates/audio/{id} | Retrieve a audio template |
| PATCH | /api/v1/templates/audio/{id} | Update a audio template |
| POST | /api/v1/templates/audio/{id}/apply | Apply an audio template (generate) |
| GET | /api/v1/templates/export | Export prompt templates as a JSON pack |
| POST | /api/v1/templates/import | Import prompt templates from a JSON pack |
| GET | /api/v1/templates/video | List video templates |
| POST | /api/v1/templates/video | Create a video template |
| DELETE | /api/v1/templates/video/{id} | Delete a video template |
| GET | /api/v1/templates/video/{id} | Retrieve a video template |
| PATCH | /api/v1/templates/video/{id} | Update a video template |
| POST | /api/v1/templates/video/{id}/apply | Apply a video template (generate via ComfyUI) |
| GET | /api/v1/user-api-keys | List user's stored API keys |
| POST | /api/v1/user-api-keys | Store or update a BYO API key |
| DELETE | /api/v1/user-api-keys/{provider} | Delete a stored API key |
| DELETE | /api/v1/users/{id} | Delete user |
| GET | /api/v1/users/{id} | Get user by ID |
| PUT | /api/v1/users/{id} | Update user by ID |
| PUT | /api/v1/users/{id}/settings | Replace user settings |
| DELETE | /api/v1/users/me | Delete current user's data |
| GET | /api/v1/users/me | Get current user |
| PUT | /api/v1/users/me | Update current user |
| PATCH | /api/v1/users/me/settings | Patch current user settings |
| POST | /api/v1/world-invites/{code}/join | — |
| GET | /api/v1/worlds | List worlds |
| POST | /api/v1/worlds | Create world |
| DELETE | /api/v1/worlds/{worldId} | Delete world |
| GET | /api/v1/worlds/{worldId} | Get world |
| PUT | /api/v1/worlds/{worldId} | Update world |
| GET | /api/v1/worlds/{worldId}/actors/{actorId}/craft-attempts | List craft attempts |
| GET | /api/v1/worlds/{worldId}/actors/{actorId}/factions/{factionId}/standing | Get faction standing |
| POST | /api/v1/worlds/{worldId}/actors/{actorId}/factions/{factionId}/standing | Adjust faction standing |
| GET | /api/v1/worlds/{worldId}/actors/{actorId}/karma | Get karma |
| POST | /api/v1/worlds/{worldId}/actors/{actorId}/karma/events | Record karma event |
| PUT | /api/v1/worlds/{worldId}/actors/{actorId}/outfit-bindings | Set location outfit rules |
| GET | /api/v1/worlds/{worldId}/actors/{actorId}/recipe-discoveries | List discovered recipes |
| POST | /api/v1/worlds/{worldId}/actors/{actorId}/recipe-discoveries | Record a recipe discovery |
| GET | /api/v1/worlds/{worldId}/anomalies | List location anomalies |
| POST | /api/v1/worlds/{worldId}/anomalies | Place an anomaly |
| POST | /api/v1/worlds/{worldId}/anomalies/{anomalyId}/discover | Roll for anomaly discovery |
| POST | /api/v1/worlds/{worldId}/anomalies/sweep | Sweep expired anomalies |
| GET | /api/v1/worlds/{worldId}/autonomy | Get the autonomy config for a world |
| PUT | /api/v1/worlds/{worldId}/autonomy/actor/{actorId} | Set a character's autonomy pacing override |
| POST | /api/v1/worlds/{worldId}/autonomy/control | Pause, resume, or single-step a world's autonomy loop |
| GET | /api/v1/worlds/{worldId}/avatars/config/{actorId} | Get world avatar config |
| PUT | /api/v1/worlds/{worldId}/avatars/config/{actorId} | Update world avatar config |
| GET | /api/v1/worlds/{worldId}/chats | List world chats |
| GET | /api/v1/worlds/{worldId}/conditions | Get world conditions |
| POST | /api/v1/worlds/{worldId}/conditions/advance | Advance world conditions |
| GET | /api/v1/worlds/{worldId}/conditions/history | List world condition history |
| POST | /api/v1/worlds/{worldId}/craft | Attempt a craft |
| GET | /api/v1/worlds/{worldId}/craft-attempts/{attemptId} | Get craft attempt |
| GET | /api/v1/worlds/{worldId}/crafting-orders | List crafting orders |
| POST | /api/v1/worlds/{worldId}/crafting-orders | Place a crafting order |
| POST | /api/v1/worlds/{worldId}/crafting-orders/{orderId}/accept | Accept a crafting order |
| POST | /api/v1/worlds/{worldId}/crafting-orders/{orderId}/cancel | Cancel a crafting order |
| POST | /api/v1/worlds/{worldId}/crafting-orders/{orderId}/fulfill | Fulfil a crafting order |
| GET | /api/v1/worlds/{worldId}/crafting-stations | List crafting station definitions |
| POST | /api/v1/worlds/{worldId}/crafting-stations | Create crafting station definition |
| DELETE | /api/v1/worlds/{worldId}/crafting-stations/{stationDefId} | Delete crafting station definition |
| GET | /api/v1/worlds/{worldId}/crafting-stations/{stationDefId} | Get crafting station definition |
| PUT | /api/v1/worlds/{worldId}/crafting-stations/{stationDefId} | Update crafting station definition |
| GET | /api/v1/worlds/{worldId}/crafting-stations/{stationDefId}/instances | List crafting station instances |
| POST | /api/v1/worlds/{worldId}/crafting-stations/{stationDefId}/instances | Place crafting station instance |
| DELETE | /api/v1/worlds/{worldId}/crafting-stations/{stationDefId}/instances/{instanceId} | Delete crafting station instance |
| GET | /api/v1/worlds/{worldId}/crafting-stations/{stationDefId}/instances/{instanceId} | Get crafting station instance |
| PUT | /api/v1/worlds/{worldId}/crafting-stations/{stationDefId}/instances/{instanceId} | Update crafting station instance |
| GET | /api/v1/worlds/{worldId}/edges | World location graph |
| DELETE | /api/v1/worlds/{worldId}/edges/{edgeId} | Delete location edge |
| PUT | /api/v1/worlds/{worldId}/edges/{edgeId} | Update location edge |
| GET | /api/v1/worlds/{worldId}/encounter-templates | List encounter templates |
| POST | /api/v1/worlds/{worldId}/encounter-templates | Create an encounter template |
| POST | /api/v1/worlds/{worldId}/encounters/{rollId}/outcome | Record an encounter outcome |
| GET | /api/v1/worlds/{worldId}/encounters/context | Build encounter context |
| POST | /api/v1/worlds/{worldId}/encounters/roll | Roll for a random encounter |
| GET | /api/v1/worlds/{worldId}/export | Export world |
| GET | /api/v1/worlds/{worldId}/factions | List factions |
| POST | /api/v1/worlds/{worldId}/factions | Create faction |
| POST | /api/v1/worlds/{worldId}/factions/{factionId}/members | Add faction member |
| DELETE | /api/v1/worlds/{worldId}/factions/{factionId}/members/{actorId} | Remove faction member |
| GET | /api/v1/worlds/{worldId}/factions/{factionId}/relationships/{otherId} | Get faction relationship |
| POST | /api/v1/worlds/{worldId}/factions/relationships | Set relationship |
| POST | /api/v1/worlds/{worldId}/factions/relationships/alliance | Form alliance |
| POST | /api/v1/worlds/{worldId}/factions/relationships/alliance/break | Break alliance |
| POST | /api/v1/worlds/{worldId}/factions/relationships/peace | Propose peace |
| POST | /api/v1/worlds/{worldId}/factions/relationships/war | Declare war |
| POST | /api/v1/worlds/{worldId}/initialize-states | Initialize world states |
| GET | /api/v1/worlds/{worldId}/invites | — |
| POST | /api/v1/worlds/{worldId}/invites | — |
| DELETE | /api/v1/worlds/{worldId}/invites/{inviteId} | — |
| GET | /api/v1/worlds/{worldId}/item-instances | List item instances |
| POST | /api/v1/worlds/{worldId}/item-instances | Place item in world |
| DELETE | /api/v1/worlds/{worldId}/item-instances/{instanceId} | Destroy item instance |
| POST | /api/v1/worlds/{worldId}/item-instances/{instanceId}/transfer | Transfer item instance |
| GET | /api/v1/worlds/{worldId}/items | List item definitions |
| POST | /api/v1/worlds/{worldId}/items | Create item definition |
| DELETE | /api/v1/worlds/{worldId}/items/{itemId} | Delete item definition |
| GET | /api/v1/worlds/{worldId}/items/{itemId} | Get item definition |
| PUT | /api/v1/worlds/{worldId}/items/{itemId} | Update item definition |
| GET | /api/v1/worlds/{worldId}/items/{itemId}/instances | List instances of item |
| GET | /api/v1/worlds/{worldId}/license | Read world license |
| PUT | /api/v1/worlds/{worldId}/license | Replace world license |
| GET | /api/v1/worlds/{worldId}/license/manifest | License manifest |
| GET | /api/v1/worlds/{worldId}/license/use-flags | List use flags |
| POST | /api/v1/worlds/{worldId}/license/validate-import | Validate an import against the license |
| GET | /api/v1/worlds/{worldId}/location-explorer | Location explorer data |
| GET | /api/v1/worlds/{worldId}/locations | List locations |
| POST | /api/v1/worlds/{worldId}/locations | Create location |
| DELETE | /api/v1/worlds/{worldId}/locations/{locId} | Delete location |
| GET | /api/v1/worlds/{worldId}/locations/{locId} | Get location |
| PUT | /api/v1/worlds/{worldId}/locations/{locId} | Update location |
| GET | /api/v1/worlds/{worldId}/locations/{locId}/ancestors | Location ancestors |
| GET | /api/v1/worlds/{worldId}/locations/{locId}/descendants | Location descendants |
| GET | /api/v1/worlds/{worldId}/locations/{locId}/details | Location detail |
| POST | /api/v1/worlds/{worldId}/locations/{locId}/discover | Force-unlock discovery |
| GET | /api/v1/worlds/{worldId}/locations/{locId}/edges | List edges at a location |
| POST | /api/v1/worlds/{worldId}/locations/{locId}/edges | Create location edge |
| POST | /api/v1/worlds/{worldId}/locations/{locId}/move | Move location |
| GET | /api/v1/worlds/{worldId}/locations/{locId}/path | Location path |
| POST | /api/v1/worlds/{worldId}/locations/{locId}/travel | Travel via location edge |
| GET | /api/v1/worlds/{worldId}/locations/tree | Recursive location tree |
| GET | /api/v1/worlds/{worldId}/lore-entries | List Lore entry |
| POST | /api/v1/worlds/{worldId}/lore-entries | Create Lore entry |
| DELETE | /api/v1/worlds/{worldId}/lore-entries/{entityId} | Delete Lore entry |
| GET | /api/v1/worlds/{worldId}/lore-entries/{entityId} | Get Lore entry |
| PUT | /api/v1/worlds/{worldId}/lore-entries/{entityId} | Update Lore entry |
| GET | /api/v1/worlds/{worldId}/maps | List maps |
| POST | /api/v1/worlds/{worldId}/maps | Create map |
| GET | /api/v1/worlds/{worldId}/maps/{mapId}/zone-at | Resolve zone at a tile |
| GET | /api/v1/worlds/{worldId}/maps/{mapId}/zones | List map zones |
| POST | /api/v1/worlds/{worldId}/maps/{mapId}/zones | Create map zone |
| POST | /api/v1/worlds/{worldId}/maps/{mapId}/zones/{zoneId}/anchor | Anchor zone to location |
| GET | /api/v1/worlds/{worldId}/npc-states/{actorId} | Get NPC state |
| PUT | /api/v1/worlds/{worldId}/npc-states/{actorId} | Update NPC state |
| GET | /api/v1/worlds/{worldId}/npcs-at/{locationId} | List NPCs at location |
| GET | /api/v1/worlds/{worldId}/quests | List world quests |
| POST | /api/v1/worlds/{worldId}/quests | Create quest |
| GET | /api/v1/worlds/{worldId}/recipes | List crafting recipes |
| POST | /api/v1/worlds/{worldId}/recipes | Create crafting recipe |
| DELETE | /api/v1/worlds/{worldId}/recipes/{recipeId} | Delete crafting recipe |
| GET | /api/v1/worlds/{worldId}/recipes/{recipeId} | Get crafting recipe |
| PUT | /api/v1/worlds/{worldId}/recipes/{recipeId} | Update crafting recipe |
| PUT | /api/v1/worlds/{worldId}/recipes/{recipeId}/materials | Replace recipe materials |
| GET | /api/v1/worlds/{worldId}/resources | List harvestable nodes at a location |
| POST | /api/v1/worlds/{worldId}/resources/extract | Attempt an extraction against a node instance |
| POST | /api/v1/worlds/{worldId}/resources/regenerate | Restore nodes whose respawn window has elapsed |
| GET | /api/v1/worlds/{worldId}/states | List world states |
| POST | /api/v1/worlds/{worldId}/states | Create world state |
| GET | /api/v1/worlds/{worldId}/storage | List storage containers |
| POST | /api/v1/worlds/{worldId}/storage | Create a storage container |
| GET | /api/v1/worlds/{worldId}/storage/{storageId} | Read a container's usage |
| GET | /api/v1/worlds/{worldId}/storage/{storageId}/contents | List a container's contents |
| POST | /api/v1/worlds/{worldId}/storage/{storageId}/deposit | Deposit items into a container |
| POST | /api/v1/worlds/{worldId}/storage/{storageId}/withdraw | Withdraw items from a container |
| GET | /api/v1/worlds/{worldId}/story-stream | Story-state stream |
| GET | /api/v1/worlds/{worldId}/stream | World conditions stream |
| GET | /api/v1/worlds/{worldId}/timelines | — |
| POST | /api/v1/worlds/{worldId}/timelines | — |
| DELETE | /api/v1/worlds/{worldId}/timelines/{timelineId} | — |
| GET | /api/v1/worlds/{worldId}/timelines/{timelineId} | — |
| PUT | /api/v1/worlds/{worldId}/timelines/{timelineId} | — |
| POST | /api/v1/worlds/{worldId}/timelines/{timelineId}/select | — |
| GET | /api/v1/worlds/{worldId}/trade/balance | Actor currency balance |
| POST | /api/v1/worlds/{worldId}/trade/buy-from-npc | Buy from NPC |
| POST | /api/v1/worlds/{worldId}/trade/execute | Execute trade |
| GET | /api/v1/worlds/{worldId}/trade/history | Trade history |
| GET | /api/v1/worlds/{worldId}/trade/offers | List trade offers |
| POST | /api/v1/worlds/{worldId}/trade/offers | Create trade offer |
| POST | /api/v1/worlds/{worldId}/trade/offers/{offerId}/accept | Accept trade offer |
| POST | /api/v1/worlds/{worldId}/trade/offers/{offerId}/cancel | Cancel trade offer |
| POST | /api/v1/worlds/{worldId}/trade/offers/{offerId}/counter | Counter trade offer |
| POST | /api/v1/worlds/{worldId}/trade/sell-to-npc | Sell to NPC |
| GET | /api/v1/worlds/{worldId}/travel-routes | List travel routes |
| POST | /api/v1/worlds/{worldId}/travel-routes | Create travel route |
| GET | /api/v1/worlds/{worldId}/travel-routes/{routeId} | Get travel route with stops |
| DELETE | /api/v1/worlds/{worldId}/travel-routes/{routeId}/attach/{locId} | Detach transport from route |
| POST | /api/v1/worlds/{worldId}/travel-routes/{routeId}/attach/{locId} | Attach transport to route |
| POST | /api/v1/worlds/{worldId}/travel-routes/{routeId}/stops | Add stop to route |
| DELETE | /api/v1/worlds/{worldId}/travel-routes/{routeId}/stops/{stopId} | Remove stop from route |
| GET | /api/v1/worlds/{worldId}/travel/status | Travel status |

## Other paths endpoints

| Method | Path | Summary |
| --- | --- | --- |
| GET | /character/{slug} | — |
| GET | /character/{slug}/{chatId} | — |
| GET | /character/{slug}/edit | — |
| GET | /characters/{id}/edit | — |
| GET | /dynamic/characters/{id}/chat-list | — |
| GET | /dynamic/characters/{id}/edit-form | — |
| GET | /dynamic/characters/grid | — |
| GET | /dynamic/characters/search | — |
| GET | /dynamic/chats/list | — |
| GET | /dynamic/chats/search | — |
| GET | /dynamic/gallery/grid | — |
| GET | /dynamic/gallery/search | — |
| GET | /dynamic/worlds/{id}/detail | — |
| GET | /dynamic/worlds/list | — |
| GET | /dynamic/worlds/search | — |
| GET | /egui | — |
| GET | /partials/{page}/{section} | — |
| GET | /views/{name} | — |
| GET | /views/admin | — |
| GET | /views/nsfw-moderation | — |
| GET | /worlds | — |
| GET | /worlds/{id} | — |
| GET | /worlds/{id}/edit | — |

## Unversioned API endpoints

| Method | Path | Summary |
| --- | --- | --- |
| GET | /api/admin/build-id | Build identity (admin) |
| GET | /api/health | Health check |

<!-- api-reference:generated:end -->
