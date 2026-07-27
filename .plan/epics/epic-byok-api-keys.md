# EPIC: BYOK API Keys (Bring Your Own Key)

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Large
**Type:** Feature Epic
**Tags:** byok, api-keys, llm, providers, privacy

## Summary

Players can bring their own LLM API keys to the running instance. Keys are visible only to the player and the system (never stored in plaintext on the server or exposed to other players). This enables use of premium/feature-rich AI providers (e.g. GPT-4, Claude, Gemini) and lets community hosts roll out good models for everyone without requiring server-side key management.

## Core Problems

### Provider Diversity

- Server-hosted models may be limited (local-only, small models)
- Players want access to best-in-class providers (OpenAI, Anthropic, Google)
- Community hosts cannot easily offer premium model access

### Privacy & Isolation

- API keys are sensitive credentials
- Keys must never be stored server-side in plaintext
- Keys must never be visible to other players or the server operator
- Each player's key namespace is isolated

### Key Rotation & Lifecycle

- Players need to add, update, and revoke keys
- Keys may expire or be compromised
- Graceful fallback when a key fails

## Design

### Key Storage (Client-Side Only)

```typescript
interface PlayerApiKey {
  provider: string; // "openai" | "anthropic" | "google" | "custom"
  keyHash: string; // SHA-256 of key for server-side lookup (no plaintext)
  keyPrefix: string; // first 4 chars, for UI display only
  createdAt: Date;
  lastUsedAt?: Date;
  isActive: boolean;
  customLabel?: string; // player-assigned name
}
```

- Keys are stored **exclusively in browser localStorage / IndexedDB**
- Server never receives the raw API key
- Server stores only a hash (for key identification and usage tracking)
- Key hash is one-way (SHA-256, no salt needed — keys are high-entropy)

### Provider Configuration

```typescript
interface PlayerProviderConfig {
  providerId: string;
  apiKeyHash: string;
  baseUrl?: string; // for custom/proxy endpoints
  modelOverrides?: string[]; // models this key is authorized for
  priority: number; // when multiple keys exist, higher = preferred
  rateLimit?: {
    requestsPerMinute: number;
    tokensPerMinute: number;
  };
}
```

### Key Visibility Rules

| Actor           | Can See Raw Key? | Can See Hash/Prefix? | Can Use Key?          |
| --------------- | ---------------- | -------------------- | --------------------- |
| Player owner    | Yes              | Yes                  | Yes                   |
| System (server) | No               | Yes (hash only)      | Yes (via hash lookup) |
| Other players   | No               | No                   | No                    |
| Server operator | No               | No                   | No                    |

### API Key Flow

```
Player adds key → client hashes key → stores raw key in localStorage → sends hash + provider to server
→ server stores hash → player uses key for generation → server routes request to provider using hash lookup
→ server never has raw key at any point
```

### Key Management UI

- Settings panel: "API Keys" section
- Add key: provider selector + key input + save (client-side hash)
- List keys: shows provider + prefix + last used + active toggle
- Revoke key: deletes local + tells server to drop hash
- Key rotation: add new key, set as preferred, revoke old

### Fallback & Routing

- If a player's key fails (401, rate limit), system falls back to server default provider
- Players can set priority ordering for multiple keys
- Per-provider rate limiting enforced client-side before sending requests

## Features

### Key CRUD

- Add new API key for a provider
- List stored keys (masked)
- Update key (revoke old, add new)
- Delete key (local + server hash removal)

### Provider Routing

- Map provider + key hash to correct API endpoint
- Support custom base URLs (for proxy/tunnel endpoints)
- Model whitelist per key (prevent unauthorized model access)

### Usage Tracking

- Track per-key usage (requests, tokens) via hash
- Display usage stats in settings
- Alert when key approaches rate limits

### Fallback System

- Automatic fallback to server default provider on key failure
- Configurable fallback priority
- Graceful degradation (notify player when falling back)

## Tasks

- [ ] Design key storage schema (client-side localStorage + server hash table)
- [ ] Implement client-side key manager (add/list/delete/rotate)
- [ ] Implement server-side hash table for key lookup
- [ ] Implement provider routing with hash-based key resolution
- [ ] Implement key failure fallback to server default
- [ ] Build API keys settings UI (add, list, revoke, priority)
- [ ] Add per-provider rate limiting (client-side guard)
- [ ] Write tests for key manager and provider routing
- [ ] Write tests for fallback system
- [ ] Security audit: verify no raw keys reach server logs or DB

## Files

- `src/crypto/key-manager.ts` — client-side key storage and hashing
- `src/db/schema-api-keys.ts` — server-side hash table schema
- `src/routes/api-keys.ts` — key hash CRUD API
- `src/generation/provider-router.ts` — routes requests to correct provider/key
- `src/generation/fallback.ts` — fallback provider logic
- `src/frontend/settings/api-keys.ts` — API keys UI component
- `docs/spec/byok-api-keys.md` — detailed spec

## References

- `epic-assistant-generation-extensions.md` — provider routing patterns
- `src/generation/` — existing generation modules
- `src/crypto/` — existing encryption utilities
- `docs/spec/implementation.md` — implementation patterns
