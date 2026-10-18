<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: BYOK API Keys (Bring Your Own Key)

**Status:** Not Started
**Priority:** high
**Effort:** Large
**Type:** Feature Epic
**Tags:** byok, api-keys, llm, providers, privacy, encryption-at-rest
**Overview:** (see sections below)

## Summary

Players can bring their own LLM API keys to the running instance. This enables use of premium/feature-rich AI providers (e.g. an OpenAI-compatible endpoint, Anthropic) and lets community hosts roll out good models for everyone without requiring server-side key management. Keys are never stored server-side in plaintext and are never visible to other players.

> **Corrected 2026-10-18 against the implementation.** This epic previously
> described a *client-side-only* design: keys "stored exclusively in browser
> localStorage / IndexedDB", the "Server never receives the raw API key", and
> the "Server stores only a hash (one-way SHA-256, no salt needed)". **None of
> that is what loop-lore implements.** The raw key is POSTed to the server and
> stored **encrypted** server-side, and the server decrypts it again on every
> request in order to call the provider. The old design is recorded below under
> *Rejected* so it is not mistaken for the contract. Every claim in this file
> was verified against source; the file list is real.

## Core Problems

### Provider Diversity

- Server-hosted models may be limited (local-only, small models)
- Players want access to best-in-class providers (OpenAI, Anthropic, Google)
- Community hosts cannot easily offer premium model access

### Privacy & Isolation

- API keys are sensitive credentials
- Keys must never be stored server-side **in plaintext**
- Keys must never be visible to other players
- Each player's key namespace is isolated (every query is scoped by `user_id`)

### Key Rotation & Lifecycle

- Players need to add, update, and revoke keys
- Keys may expire or be compromised
- Graceful fallback when a key fails

## Implemented Design (verified 2026-10-18)

### Where a key actually lives

```
browser --POST /api/user-api-keys { name, api_key }--> loop-lore
loop-lore: encryptValue(api_key, config.byoKey.encryptionKey)
           +-> user_api_keys.api_key_encrypted   (AES-256-GCM ciphertext)
loop-lore: decryptValue(row.api_key_encrypted, ...) at request time
           +-> outbound HTTP request to the provider
```

Verified points:

- `src/routes/api-keys.ts:70` --
  `const { name: providerName, api_key: apiKey } = ctx.body;`
  **The raw key reaches the server.**
- `src/routes/api-keys.ts:72-79` -- rejected outright unless
  `config.byoKey.encryptionKey` is configured.
- `src/routes/api-keys.ts:82-86` -- the provider name is validated against
  `config.generation.providers.openaiCompatible` before anything is stored.
- `src/routes/api-keys.ts:91` -- `encryptValue(apiKey, encryptionSecret)`.
- `src/routes/api-keys.ts:99-128` -- upsert keyed on `(user_id, provider_name)`:
  one row per provider per user, never a duplicate.
- `src/routes/api-keys.ts:43-48` -- `GET` returns **only** `provider_name`,
  `created_at`, `updated_at`. No key material, no hash, no prefix is ever
  returned.
- `src/generation/providers/registry.ts:126-135` -- `resolveProvider` selects the
  row for `(user_id, provider_name)` and calls
  `decryptValue(row.api_key_encrypted, config.byoKey.encryptionKey)`. **The server
  does recover the raw key**, on every request, in order to call the provider.
- `src/db/schema-core.ts:220-227` -- `interface UserApiKeys` is the row shape:
  `{ id, user_id, provider_name, api_key_encrypted, created_at, updated_at }`.
  **There is no hash column and no key-prefix column.** The previous
  `keyHash` / SHA-256 claims described a column that does not exist.

### Encryption at rest

`src/crypto/byok.ts`, re-exported from `src/crypto/index.ts`:

- **AES-256-GCM**, 12-byte (96-bit) IV, freshly generated per encrypt.
- **Per-record 16-byte random salt**, written into the wire format.
- **HKDF-SHA256** key derivation from `config.byoKey.encryptionKey` + that salt,
  replacing the earlier PBKDF2 + fixed global salt (see
  `BUG-jwtsecret-reused-across-three-security-domains-byok-pbkdf2-f.md`).
- Wire format: `salt:iv:ciphertext`, three base64 chunks. The legacy two-chunk
  `iv:ciphertext` form is still readable; those rows are **not** silently
  re-encrypted.
- `decryptValue` throws on a wrong secret, on tampered ciphertext, and on a
  malformed chunk count (`src/crypto/byok.test.ts:70-83`).
- Configuration: `config.byoKey.enabled` (default `true`) plus the optional
  `config.byoKey.encryptionKey` (`src/config/sections/byo-key.ts:6-21`), also
  settable via `BYO_KEY_ENABLED` / `BYO_KEY_ENCRYPTION_KEY`.

### Failure behaviour

- `src/generation/providers/registry.ts:136-144` -- a decrypt failure is
  **non-fatal**: it logs the provider name and `userId` (never key material)
  and falls through.
- `src/generation/providers/registry.ts:148-157` -- falls back to the first
  configured `openaiCompatible` instance and to `defaultModels[name]`.
- `src/generation/providers/registry.ts:159-164` -- otherwise throws
  `No provider resolved for "<name>". Configure a provider in config file or
  LLM_PROVIDER_* env vars.`

### Threat model

**What the implemented design DOES cover**

- **A stolen database alone yields nothing usable.** Without
  `byoKey.encryptionKey` the ciphertext is inert: there is no hash to reverse and
  no plaintext column to read.
- **Cross-user isolation.** Every read and write is scoped by `user_id`
  (`registry.ts:129`; `api-keys.ts:44-47`, `:100-105`, `:150-155` -- every write
  is reached only through a `(user_id, provider_name)` lookup, then applied by
  primary key). One player cannot list or
  delete another's key -- asserted by
  `src/routes/api-keys.coverage.test.ts:171-188`.
- **No key material in logs.** The single failure path logs provider, `userId`
  and error text and nothing else (`registry.ts:136-144`).
- **Tampering fails closed.** Modified ciphertext throws rather than returning
  garbage plaintext.
- **The server operator cannot read keys without the configured encryption key.**

**What it does NOT cover -- stated plainly**

- **This is encryption at rest with a server-held key. It is NOT the previously
  claimed never-sent design.** loop-lore receives the raw key over HTTP and
  decrypts it on every request. Anyone holding the database **and** the server's
  `byoKey.encryptionKey` (config file or `BYO_KEY_ENCRYPTION_KEY` environment)
  recovers every user's key trivially. The two designs are not equivalent and
  must never be described interchangeably.
- **One global encryption key for all users**, with no rotation story -- tracked
  by `BUG-single-global-byok-encryption-key-no-rotation-story.md`.
- **Transport security.** The raw key transits the client's request to the
  server; its protection depends on TLS terminating correctly, which is outside
  this epic.
- **No per-key revocation at the upstream provider.** `DELETE` drops loop-lore's
  row; a leaked key must be rotated at the provider itself.
- **No client-side rate limiting, model whitelist, priority ordering, or usage
  tracking** -- see below.

### Rejected: client-side-only storage with a one-way hash

The previous design kept the raw key in browser `localStorage` / IndexedDB, sent
only a SHA-256 hash to the server, and routed by hash lookup. It is rejected
because it is not implementable against the actual call site:
`resolveProvider` needs a usable credential to call the provider, and a hash is
not a credential. The properties that design was reaching for -- keys never at
rest in plaintext on the server, keys invisible to other players, keys
unreadable by the operator without a secret -- are supplied by the
encryption-at-rest design above instead.

### Not yet implemented

```typescript
interface PlayerApiKey {
  providerName: string;   // shipped -- GET returns this
  createdAt: Date;        // shipped -- created_at
  updatedAt: Date;        // shipped -- updated_at
  // keyHash, keyPrefix, lastUsedAt, isActive, customLabel: NOT shipped.
  // There is no hash or prefix column and GET returns no key material.
}

interface PlayerProviderConfig {
  providerId: string;     // shipped
  baseUrl?: string;       // from config.generation.providers.openaiCompatible
  // apiKeyHash, modelOverrides, priority, rateLimit: NOT shipped.
  // There is no per-key ordering: one row per (user, provider).
}
```

### Key Visibility Rules (corrected)

| Actor | Raw key in memory | Raw key at rest | Ciphertext | Usable credential |
|---|---|---|---|---|
| Player owner | Yes | No | No | Yes (their own) |
| loop-lore server | **Yes** -- decrypts per request | No (AES-256-GCM) | Yes | Yes |
| Other players | No | No | No | No |
| Server operator | Yes, **if** they hold `byoKey.encryptionKey` | No | Yes | Yes |

## Features

### Key CRUD (shipped)

- Add / upsert a key for a provider -- `POST /api/user-api-keys`
- List keys -- `GET /api/user-api-keys`; returns provider name and timestamps
  only, never key material
- Update a key -- re-POST the same provider (upsert)
- Delete a key -- `DELETE /api/user-api-keys/:provider`
- Gated on `config.byoKey.enabled`; `POST` additionally requires
  `config.byoKey.encryptionKey`

### Provider Resolution (shipped)

- BYO key first, then the first configured `openaiCompatible` instance and
  `defaultModels[name]`, then a hard error (`registry.ts:110-172`)
- Custom `baseUrl` per provider instance, for proxy/tunnel endpoints
- Provider names are validated against the configured `openaiCompatible`
  instances -- see `BUG-byok-store-rejects-non-openaicompatible-provider-names.md`

### Fallback (shipped, minimal)

- A decrypt failure is non-fatal and falls back to the server default provider
- There is no configurable per-key priority: one row per `(user, provider)`

### Not shipped

- Per-key model whitelist, priority ordering, per-key usage tracking, client-side
  rate limiting, and any BYOK settings UI. `src/frontend/alpine/settings/` is the
  LLM provider settings page and is a different surface; no
  `src/frontend/settings/api-keys.ts` exists.

## Tasks

- [x] Server-side key CRUD API (`src/routes/api-keys.ts`)
- [x] Encryption at rest: AES-256-GCM, per-record salt, HKDF-SHA256
      (`src/crypto/byok.ts`)
- [x] Provider resolution preferring the user's BYO key, with server-default
      fallback (`src/generation/providers/registry.ts:110-172`)
- [x] Cross-user isolation, gating and CRUD tests
      (`src/routes/api-keys.coverage.test.ts`)
- [x] Crypto tests: round-trip, tamper, wrong secret, wire format
      (`src/crypto/byok.test.ts`)
- [ ] Key rotation story for the single global encryption key
      (`BUG-single-global-byok-encryption-key-no-rotation-story.md`)
- [ ] One-shot re-encryption migration off the legacy `iv:ciphertext` wire
      format
- [ ] BYOK settings UI (add / list / revoke) -- does not exist
- [ ] Write the missing `docs/spec/byok-api-keys.md`
- [ ] Decide whether BYOK should cover image providers; it currently does not
      (see *Known Gap* below)

## Files

- `src/routes/api-keys.ts` -- key CRUD API (`GET`/`POST`/`DELETE
  /api/user-api-keys`)
- `src/routes/api-keys.coverage.test.ts` -- CRUD, feature gating, cross-user
  isolation
- `src/crypto/byok.ts` -- AES-256-GCM encrypt/decrypt with a per-record salt
- `src/crypto/byok.test.ts` -- round-trip, tamper, wrong-secret, wire-format tests
- `src/crypto/index.ts` -- re-exports `encryptValue` / `decryptValue`
- `src/db/schema-core.ts` -- the `UserApiKeys` table (`:220-227`)
- `src/db/migrations/001_init.ts` -- the table's original migration (`:212-220`)
- `src/generation/providers/registry.ts` -- `resolveProvider` BYO-key resolution
  and server-default fallback
- `src/config/sections/byo-key.ts` -- `byoKey.enabled` / `byoKey.encryptionKey`
- `src/config/sections/generation/meta.ts` -- the `generation.providers` surface
- `src/validation/db-schemas.ts` -- the `UserApiKeysSchema` validation schema
- `src/test-utils/insert-helpers.ts` -- `user_api_keys` test fixture insert

*Removed from the previous list because these files do not exist:* `src/crypto/key-manager.ts`,
`src/db/schema-api-keys.ts`, `src/generation/provider-router.ts`,
`src/generation/fallback.ts`, `src/frontend/settings/api-keys.ts`,
`docs/spec/byok-api-keys.md`.

## Known Gap: BYOK does not cover image providers

> **Corrected 2026-10-18 during self-review.** An earlier draft of this section
> claimed "remote/hosted image generation does not exist". **That was wrong.**
> It was derived from the audit's reading of `generation.providers`, which
> describes the *LLM* provider map only. The image surface is a separate array,
> `generation.providers.sd[]`, and it has a fully implemented **remote** backend.
> The accurate gap is narrower: BYOK resolves credentials for chat providers only.

**Remote image generation does exist.** Image generation is configured as
`generation.providers.sd: ImageProviderConfig[]`
(`src/config/schema/providers.ts:111`) and dispatched by `apiFamily` in
`src/generation/image-engine/index.ts:36-61` across four implemented backends:

| `apiFamily` | Backend | Remote? |
|---|---|---|
| `openai` | `src/generation/image-engine/openai.ts` -- POSTs `${baseUrl}/v1/images/generations` with `Authorization: Bearer ${apiKey}` (`:22-25`) | **Yes -- hosted** |
| `sdapi` | `src/generation/image-engine/sdapi.ts` | Usually local |
| `sdcpp` | `src/generation/image-engine/sdcpp.ts` | Local |
| `comfyui` | `src/generation/image-engine/comfyui.ts` | Local (a ComfyUI you run) |

`src/generation/image-gen-route.ts:105` selects one via
`pickSdProvider(config.generation.providers.sd, "generate")` and returns 501 when
none is configured; `src/config/schema/sd-provider.ts:19` implements the picker.
Note that `generationMeta` (`src/config/sections/generation/meta.ts:14-17`) and
`GenerationSection` (`src/config/sections/generation/section.ts:14-16`) describe
only `openaiCompatible` -- `meta.ts` is descriptive metadata, not a gate, and
`src/config/load/load.ts:141-143` still normalises `providers.sd`. Do not read
`meta.ts` as the shape of the config.

**The real gap: BYOK does not reach any of them.**

- BYOK resolution lives only on the chat path: `resolveProvider` reads
  `user_api_keys` for the resolved LLM provider (`registry.ts:123-135`).
- `POST /api/user-api-keys` validates the provider name against
  `generation.providers.openaiCompatible` only (`api-keys.ts:82-86`), so a user
  **cannot even store** a key for an image provider -- see
  `BUG-byok-store-rejects-non-openaicompatible-provider-names.md`.
- `src/generation/image-gen-route.ts` never consults `byoKey`, `user_api_keys`,
  or `resolveProvider`; `userId` is used only for chat-access and ownership
  checks. The image credential is the static `ImageProviderConfig.apiKey` read
  from the server's own config file.

So the user-visible statement is: **a BYOK-only user gets remote chat inference
but cannot supply an image-provider credential through BYOK.** Remote image
generation itself works -- it is operator-configured, not user-supplied. That is
a credential-coverage gap, not a missing feature.

Out of scope for this epic: widening the BYOK provider allowlist beyond
`openaiCompatible`; per-user image-provider credentials; and hosted ComfyUI
offerings (ComfyUI is local by definition -- `src/generation/providers/comfyui.ts`
is an HTTP client over a `baseUrl` (`:82-106`, `:116`, `:151`, `:244`, `:257`,
`:297`) that never spawns a process). Provisioning for a *local* ComfyUI is
`epic-comfyui-lifecycle.md`'s job.

## Linked Tasks

- [TASK-byok-api-keys.md](../tickets/TASK-byok-api-keys.md)

## References

- `epic-assistant-generation-extensions.md` -- provider routing patterns
- `src/generation/providers/registry.ts` -- provider resolution and failover
- `src/generation/providers/comfyui.ts` -- the local-only image backend
- `src/crypto/` -- existing encryption utilities
- `docs/spec/crypto.md` -- the encryption primitives spec
- `docs/spec/implementation.md` -- implementation patterns
- `epic-comfyui-lifecycle.md` -- local ComfyUI provisioning and launch (ComfyUI is
  local by definition; see *Known Gap*)
