# TASK: Encryption — Access Management & Time-Based Expiry

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Med
**Epic:** epic-crypto
**Parent:** TASK-epic17-encryption-e2e-expansion
**Blocked by:** TASK-encryption-group-key-distribution

## Summary

Time-based access control for encrypted content. Admins can set access time limits; after expiry, keys become invalid. Re-access requires new key grant.

## What Exists

- `src/crypto/actor-keys.ts` — actor key management
- `chat_participants` table — participant tracking
- Spec: "Access time allowance — keys rotation upon person leaving or losing access"

## Design

### Access Control Model

```
Participant Access:
  ├── Granted: key wrapped and distributed
  ├── Active: key valid, can decrypt
  ├── Expired: key invalid after time limit
  └── Revoked: key rotated out (participant left)

Time-Based Expiry:
  ├── Admin sets: access_duration_days per chat
  ├── On expiry: key becomes invalid
  ├── Messages remain encrypted (not deleted)
  └── Re-access: admin grants new key
```

### Schema

```typescript
interface AccessGrant {
  id: string;
  chatId: string;
  participantId: string;
  grantedAt: Date;
  expiresAt: Date | null; // null = no expiry
  revokedAt: Date | null; // null = not revoked
  keyId: string; // Which key was granted
}
```

## Tasks

- [ ] Add `access_duration_days` column to `chats` table
- [ ] Add `expires_at` column to `chat_participants` table
- [ ] Add `revoked_at` column to `chat_participants` table
- [ ] On key retrieval: check expiry before returning key
- [ ] On expiry: mark key as invalid, notify participant
- [ ] Admin endpoint: grant/revoke/extend access
- [ ] Admin UI: access management panel per chat
- [ ] Add tests: expiry enforcement, re-access grant

## Files to Modify

- `src/db/schema-chats.ts` — add access columns
- `src/db/migrations/` — migration
- `src/crypto/chat-keys.ts` — expiry check on key retrieval
- `src/routes/chats.ts` — admin access endpoints
- `src/frontend/alpine/admin-chats.ts` — access management UI

## Risk

Med — time-based logic, admin UI, notification on expiry.

## Linked Epics

- `epic-crypto.md`
