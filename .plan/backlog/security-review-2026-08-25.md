<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-License-Identifier: 2026 Loop Lore Contributors -->

# Security Review Plan — Auth & Access Surface (2026-08-25)

> **Author:** OpenAgent security review pass (session 2026-08-25)
> **Scope reviewed:** (A) Registration & Authorization HTTP flow — `src/auth/*`, `src/routes/auth/*`, `src/middleware/auth/*`; (1) WebSocket transport auth — `src/transport/*`; (2) RBAC enforcement at route layer — `src/users/permissions.ts` + call sites; (3) Asset object-level authz — `src/assets/controller/*`, `src/assets/service/*`.
> **Source of truth:** `src/` runnable code; `.plan/` requirements. `AGENTS.md` conventions enforced.
> **Status:** FINDINGS TRIAGED — fix tickets proposed below; not yet implemented.

## Cross-review dedup notes

> Follow-up subsystem passes (db, auth/middleware, routes/validation, chat pipeline) filed their own `BUG-*` tickets — see `.plan/tickets/` + git issues; not duplicated here.

- Malformed-payload JWT ticket ⊆ `b87cc89` (`verifyJwt` claimless-valid) — close as dupe when fixing.
- getClientIp/XFF ticket ⊆ `a001848` (auth hardening) — close as dupe when fixing.
- Logout ownership ticket supersedes part of `e16fb61` (adds logout sig+ownership); keep both until fix lands.
- Auto-gen stream ticket overlaps `d14fd85` (generation error handling) — fix together.
- `/me` unsigned fallback reappears in follow-up auth pass — same root cause as `e16fb61`.

## Next review points (backlog — not yet started)

## Triage summary

| Severity | Count | Headline |
| -------- | ----- | -------- |
| CRITICAL | 2 | `/me` unverified token; `verifyJwt` claimless-valid |
| HIGH | 2 | Asset arbitrary file write; SVG stored XSS |
| MEDIUM | 9 | algo pin, XFF trust, derive non-short-circuit, maxSessions unused, `body.userId` override, RBAC matrix unused, MIME not sniffed, visibility leak, path containment |
| LOW | 11 | see Findings §LOW |

## Findings

### CRITICAL

- `src/routes/auth/session.ts:handleMe` — `handleMe` falls back to `extractUserIdFromJwt(token)` (base64 decode, **no signature check**) when `derivedUserId` is null. Global `.derive` (`src/elysia-app.ts:46`) does NOT short-circuit on auth failure → sets `userId:null` and continues. Forged `ll_token` cookie → impersonate any user on `GET /api/auth/me`. **Fix:** drop cookie fallback; `if (!derivedUserId) return unauthorized();`.
- `src/auth/jwt.ts:verifyJwt` — `jsonParseOr(payloadStr, {} as JwtPayload)` returns `{}` on parse failure; `payload.exp < now` → `undefined < now === false` → token with valid signature but empty/missing `exp` is `valid:true` with no `sub`/`sid`/`role`; missing `exp` never expires. **Fix:** treat parse failure as invalid; assert `sub`/`sid` present and `exp` finite `> now`.

### HIGH

- `src/assets/service/file-system.ts:50-53` + `src/assets/controller/upload.ts:26` — `ext = filename.split(".").pop()` keeps `/` and `..`; `storage_path = raw/ab/cd/<id>.<ext>` then `writeFileSync` → filename `a.png/../../../../tmp/x` escapes upload root → **arbitrary file write** by any authenticated uploader. **Fix:** basename + strip separators; whitelist ext `[\w]+`; assert resolved path ⊆ `uploadDir`.
- `src/assets/controller/upload.ts:50` + `serve.ts:96` — `image/*` prefix allows `image/svg+xml`; client `file.type` stored and echoed as `Content-Type` → SVG served inline → **stored XSS**. **Fix:** block `image/svg+xml` (and other scriptable types); else `Content-Disposition: attachment` + `X-Content-Type-Options: nosniff`.

### MEDIUM

- `src/routes/auth/register.ts:21` / `login.ts` — `Bun.password.hash(password)` uses Bun default **argon2id**; spec (`docs/spec/users-sessions.md`, `auth-middleware.md`) mandates **scrypt**; plan says bcrypt/argon2. Three-way conflict + algorithm unpinned. **Fix:** pin `{ algorithm: "argon2id", memoryCost, timeCost }`; reconcile spec.
- `src/routes/auth/shared.ts:getClientIp` — trusts `X-Forwarded-For` first hop unconditionally → spoof IP to bypass login (10/min) / register (3/hr) limiters. **Fix:** trust XFF only behind configured trusted proxy; else socket `remoteAddress`.
- `src/elysia-app.ts:46` + `src/middleware/elysia-auth.ts:27` — `.derive` non-short-circuit on auth failure (structural weakness behind `/me`). **Fix:** hard-fail required routes; expose `authenticated` flag; don't rely on per-handler null checks.
- `src/config/schema` `maxSessionsPerUser` (default 10) — defined but **never enforced**; sessions inserted unbounded. **Fix:** enforce cap on insert (evict oldest) or remove config.
- `src/routes/messages/create-entity-confirm.ts:75` — `insertGeneratedEntity({ userId: body.userId ?? actorId })` → authenticated participant attributes generated entity to **arbitrary user_id** (cross-user impersonation). **Fix:** drop `body.userId`; always use authenticated `actorId`.
- `src/users/permissions.ts:33` — 24/~32 capabilities NEVER enforced anywhere; RBAC collapses to ad-hoc `owner_id===userId` + `admin.*` wildcard. **Fix:** route object ops through `requireCapability(ctx, perm, { ownerId })` or reconcile matrix to perms actually checked.
- `src/assets/controller/upload.ts:46-52` — MIME client-asserted, never content-sniffed; stored/replayed as `Content-Type` → type confusion. **Fix:** sniff magic bytes; map to allowed type; ignore client `type`.
- `src/assets/service/read.ts:84` vs `:194` — `visibilityFilter` treats `Shared` as world-readable to ANY authed user, but `canAccessAsset` requires a real `asset_shares` row → metadata leak of specifically-shared assets via `GET /api/assets`. **Fix:** Shared filter must AND with `asset_shares.shared_with_id = actorId`.
- `src/assets/service/file-system.ts:53,61,69` — `join(uploadDir, storagePath)` without containment assert (amplifies file-write). **Fix:** `path.resolve` + assert `.startsWith(uploadDir + sep)`.
- `src/middleware/auth/authenticate.ts:verifyTokenContext` — `last_seen_at` written on **every** authenticated request (unthrottled). **Fix:** throttle (≤ once / 5 min) or async queue.

### LOW

- `src/routes/auth/session.ts:handleLogout` — `extractSessionIdFromJwt` (no sig check) drives `DELETE FROM sessions WHERE id=sid`; forged token + known `sid` = logout DoS. **Fix:** verify JWT; delete only `WHERE id=sid AND user_id=payload.sub`.
- `src/routes/auth/login.ts` — bad-request / secret-missing errors return literal `"errors.badRequest"` / `"errors.serverError"` (untranslated); `register.ts` does it right. **Fix:** `t ? t("errors.badRequest") : "..."`.
- `src/auth/jwt.ts:verifyJwt` — does not assert header `alg === "HS256"` (cheap defense-in-depth). **Fix:** reject non-HS256.
- `src/routes/auth/shared.ts:setTokenCookie` — omits `Secure` outside prod; no `__Host-` prefix. **Fix:** `__Host-ll_token` + Secure + Path=/.
- `src/routes/auth/register.ts` — password ≥6 but spec ≥8; username length-only (spec wants `alphanumeric+_`); no email/display-name/terms/CAPTCHA (spec drift, TODO). **Fix:** align to spec.
- `src/frontend/alpine/transports/server.ts:35,40` — telemetry client sends localStorage `session_token` (XSS-exfiltratable, parallel to verified JWT). **Fix:** verify server-side; prefer HttpOnly cookie.
- `src/assets/service/file-system.ts:25` — `FORBIDDEN_ROOTS` only blocks exact roots + `/home` children; `/srv`, `/tmp/x` unvalidated. **Fix:** allowlist expected base; reject outside.
- `src/users/permissions.ts` `solo:["*"]` + `src/assets/service/read.ts:188` — solo role `*` bypasses all ownership in `required:false` mode (by-design footgun). **Fix:** document; never run `required:false` multi-user.
- `src/assets/service/read.ts:106,188` — asset admin-override reuses `admin.character` for all polymorphic kinds. **Fix:** dedicated `asset.admin` perm or document.
- `src/routes/auth/shared.ts` — `sessions.token_hash` stores `jwt:${sid}` (not a hash); misleading name. **Fix:** rename column or store real hash.
- `src/middleware/rate-limit.ts` — in-memory per-process limiter (resets on restart, not shared across instances). **Fix:** note for multi-instance; consider shared store.

## Positives (no action)

- `src/middleware/auth/authenticate.ts` — `verifyJwt` signature-checked; session exists+unexpired+user active; `userId=payload.sub` (full verified binding); solo only when `required===false`.
- `src/assets/controller/serve.ts` — requires verified `ctx.userId` OR valid signed URL; anonymous → 404 (no unauth read). Signed URLs: HMAC over `action:assetId:expires`, constant-time compare, expiry enforced → no replay/cross-file.
- `src/routes/chats/manage.ts`, `src/personas/*`, `src/routes/nsfw-moderation/*` — ownership/`admin.*`/`moderation.*` gates present; role server-derived (not spoofable).
- `src/transport/*` — WS is a **client** lib; no server-side WS auth surface exists → no `/me`-class bug there today.
- `src/chat/ownership.ts` — `requireChatParticipant`/`requireActorExists` guard forged ids.

## Filed tickets (git issues)

> All filed via `bun run scripts/worktree/ ticket`. Tracking label `security`.

| Git issue | Sev | Finding | Files |
| --------- | --- | ------- | ----- |
| `e16fb61` | CRIT | `/me` trusts unverified JWT (impersonation) | session.ts, elysia-app.ts |
| `b87cc89` | CRIT | `verifyJwt` accepts claimless/malformed payload | jwt.ts |
| `e4000f4` | HIGH | Asset upload path traversal → arbitrary file write | file-system.ts, upload.ts |
| `962618b` | HIGH | SVG upload stored XSS | upload.ts, serve.ts |
| `0ce5784` | CRIT | CSP `unsafe-inline`+`unsafe-eval` defeats nonce | config/sections/headers.ts |
| `6bda93f` | CRIT | Frontend exposes `session_token` in localStorage | frontend/alpine/transports/server.ts |
| `2129b97` | CRIT | RBAC 25/30 capabilities never enforced | users/permissions.ts |
| `ef55dc7` | HIGH | Settings PATCH `t.Any` mass-assignment | routes/settings.ts |
| `fcdcefc` | HIGH | Telemetry `userId` from request body (forgeable) | routes/telemetry.ts |
| `8c992e8` | HIGH | Character edit form unescaped fields (stored XSS) | routes/views/character-edit-form.ts |
| `ac7ae01` | HIGH | Traits page unescaped `innerHTML` (stored XSS) | frontend/pages/characters-traits.ts |
| `663722a` | HIGH | Char/world prompt overrides injected as system | assistant/prompt-assembler.ts, prompt/sections/system.ts |
| `9aec25a` | HIGH | Chat history System-role injection | assistant/prompt/sections/chat-history.ts |
| `cad5904` | HIGH | Lore/persona/traits as system messages (semantic injection) | assistant/prompt/sections/lore.ts, character-traits.ts, user-persona.ts |
| `3457e6b` | HIGH | `maxTokens`/prompt array unvalidated (cost/DoS) | generation/generate-route/handler.ts, build-prompt.ts |
| `06df3a3` | MED | Defined-but-not-enforced debt (schemas, validators, config) | validation/schemas, assistant/validation.ts, config/sections/messages.ts, rpg-service-utils.ts |
| `d14fd85` | MED | Generation error-handling gaps (detector, abort, void) | generation/auto-gen/call-llm.ts, story/gm/decisions/llm.ts |
| `3691b57` | MED | Frontend sanitize fallbacks inject raw HTML | frontend/alpine/chat-generations.ts, components/chat/message-list.html |
| `a001848` | MED | Auth hardening: XFF trust, session cap, algo pin, derive short-circuit, logout verify | routes/auth/shared.ts, config/schema, elysia-app.ts, session.ts |
| `843a93c` | LOW | Auth polish: MIME sniff, visibility, last_seen, i18n, cookie, register spec, misc | routes/auth/*, assets/service/read.ts |

## Next review points (backlog — not yet started)

- ~~**(4) Input validation coverage**~~ ✅ done (filed 9f6b799 + 06df3a3)
- ~~**(5) `src/crypto/` key handling**~~ ✅ done (filed 95aacd1)
- ~~**(6) NSFW gate ordering**~~ ✅ done (filed f0683a8, 5232abe, 7ba53d1)
- ~~**(7) `src/regex/` ReDoS**~~ ✅ done (filed 5c73739, 1330c1f, 3302cdc)
- ~~**(8) DB query safety + migration drift**~~ ✅ done (filed abc8205, c5a899d)
- ~~**(9) Logging PII/secret redaction**~~ ✅ done (filed 377cf9c, 8e464f9, 714ca84)

### Round 2 — filed tickets (git issues)

| Git issue | Sev | Finding | Files |
| --------- | --- | ------- | ----- |
| `f0683a8` | CRIT | Story/GM generation never NSFW-gated | generation/auto-gen/story-mode.ts |
| `5c73739` | CRIT | ReDoS: lore activation `RegExp` from author key | assistant/prompt/sections/lore-activation.ts |
| `5232abe` | HIGH | NSFW age gate never verified at generation | generation/auto-gen/content-hooks.ts |
| `1330c1f` | HIGH | ReDoS: config transforms `RegExp` from pattern | generation/transforms.ts |
| `377cf9c` | HIGH | Logger censor bypasses message field | logger/logger.ts |
| `8e464f9` | HIGH | Log files world-readable (0644) | logger/transports/file.ts |
| `abc8205` | HIGH | deleteChat no transaction (orphan risk) | chat/service/crud/delete.ts |
| `7ba53d1` | MED | NSFW gate gaps (performedBy, audit, misconfig, PII secret) | nsfw-moderation/actions.ts, nsfw-hook.ts, pii-redaction.ts |
| `3302cdc` | MED | Regex safety: xml-utils tag, narrative greedy | assistant/xml-utils.ts, regex/narrative.ts |
| `95aacd1` | MED | Crypto: BYO key optional/weak + PBKDF2 100k | config/sections/byo-key.ts, crypto/byok.ts |
| `9f6b799` | MED | Input validation: battle/*, emotion-avatars, query | routes/battle/*, character-emotion-avatars.ts |
| `c5a899d` | MED | DB: asset delete tx, N+1 purge, column allowlist, playthrough | assets/service/delete.ts, memory/purge.ts, db/optimistic-locking.ts |
| `714ca84` | MED | Logging: censor exact-match + error-stack path leak | logger/censors.ts, logger/logger.ts |

**Security review sweep COMPLETE.** Total tickets filed: 33 (label `security`).
Sweep covered: auth/registration flow, WS transport, RBAC enforcement, asset authz, defined-but-not-enforced audit, frontend XSS/CSP, prompt-injection/generation, input validation, crypto keys, NSFW gate, regex ReDoS, DB safety, log redaction.

**Remaining (out of original scope, lower priority):** dependency CVE scan (user-deferred — lower priority than above), ~~concurrency races~~ ✅ done, ~~test-coverage gap analysis~~ ✅ done.

### Round 3 — filed tickets (git issues)

| Git issue | Sev | Finding | Files |
| --------- | --- | ------- | ----- |
| `67ed226` | MED | Admin handlers lack explicit `requireUserId` (fail-open structural risk) | routes/admin/*.ts |
| `53bd3e7` | LOW | Duplicate `/admin/templates` route registration, differing gates | routes/admin/templates.ts, admin-templates/* |
| `d239395` | MED | RPG XP/intimacy read-modify-write lost updates | rpg/seduction/service/skills.ts, rpg/skills/service/progression.ts, rpg/intimacy/service/actions.ts |
| `bee01ca` | MED | Solo-user cold-start race caches phantom uid | middleware/auth/solo-user.ts |
| `c8dbeab` | MED | Asset dedup TOCTOU duplicate rows + orphan files | assets/service/create.ts |
| `3a009b6` | MED | Crafting shared sync connection → database-is-locked | rpg/crafting/process.ts |
| `76d9ab4` | MED | Register username race + rate-limiter multi-instance gap | routes/auth/register.ts, middleware/rate-limit.ts |
| `e9c30c5` | HIGH | Add security regression tests for CRITICAL/HIGH bugs | test suite (meta) |

**GRAND TOTAL: 41 tickets filed** (label `security`) across the full sweep.

### Remediation priority (recommended order)

1. CRITICAL auth/core: `0ce5784` CSP · `e16fb61` /me · `b87cc89` verifyJwt · `f0683a8` NSFW gen gate · `5c73739` ReDoS lore
2. HIGH: `6bda93f` session token · `2129b97` RBAC · `5232abe` NSFW age · `1330c1f` ReDoS transforms · `377cf9c` logger censor · `8e464f9` log perms · `abc8205` deleteChat tx · `e9c30c5` regression tests
3. MEDIUM: crypto BYO · input-val battle · DB tx/N+1 · logging censor/stack · NSFW gaps · regex safety · admin requireUserId · concurrency races (d239395, bee01ca, c8dbeab, 3a009b6, 76d9ab4)
4. LOW: duplicate templates route · auth polish group · auth hardening group

**Suggested first remediation commit set (all independent, each with regression test):** `e9c30c5` (tests) → `0ce5784` → `e16fb61` → `b87cc89` → `f0683a8` → `5c73739`.

## Verification gates (post-fix)

`bun run check` (gate green) + `bun test src/` for: jwt, session, assets/upload, assets/serve, permissions, create-entity-confirm. Add regression tests for `/me` bypass + asset traversal + SVG.
