# FEAT-byok-api-keys: BYOK API Keys

**Status**: open
**Priority**: high
**Labels**: byok, api-keys, llm, providers, privacy
**Assignee**:
**Epic**: EPIC-byok-api-keys
**Related**: epic-assistant-generation-extensions.md, epic-llm-queue.md

---

## Description

Players can bring their own LLM API keys to the running instance. Keys are stored exclusively client-side (localStorage/IndexedDB) and are never transmitted to the server in plaintext. The server stores only a SHA-256 hash for key identification and usage tracking. This enables use of premium providers (OpenAI, Anthropic, Google) and lets community hosts roll out good models for everyone.

## Acceptance Criteria

- [ ] Player can add an API key for a provider (key stored client-side, hash sent to server)
- [ ] Server never receives or stores raw API keys
- [ ] Keys are visible only to the owner (masked in UI, prefix shown)
- [ ] Player can list, revoke, and rotate keys
- [ ] Provider routing maps hash to correct API endpoint
- [ ] Fallback to server default provider on key failure (401, rate limit)
- [ ] Per-provider rate limiting enforced client-side
- [ ] API keys settings UI (add, list, revoke, priority ordering)
- [ ] Usage tracking per key (requests, tokens) via hash
- [ ] Security audit: verify no raw keys reach server logs or DB
- [ ] Unit tests for key manager and provider routing
- [ ] Unit tests for fallback system

## Notes

### Key Storage Architecture

- Client: raw key in localStorage, hash for server communication
- Server: hash → provider config mapping only
- Never log raw keys; hash is one-way (SHA-256)

### Privacy Model

| Actor           | Sees Raw Key? | Sees Hash? | Can Use Key? |
| --------------- | ------------- | ---------- | ------------ |
| Player owner    | Yes           | Yes        | Yes          |
| System (server) | No            | Yes        | Yes          |
| Other players   | No            | No         | No           |
| Server operator | No            | No         | No           |

### Related Files

- `src/crypto/key-manager.ts` — client-side key storage and hashing
- `src/db/schema-api-keys.ts` — server-side hash table schema
- `src/routes/api-keys.ts` — key hash CRUD API
- `src/generation/provider-router.ts` — routes requests to correct provider/key
- `src/generation/fallback.ts` — fallback provider logic
- `src/frontend/settings/api-keys.ts` — API keys UI component
