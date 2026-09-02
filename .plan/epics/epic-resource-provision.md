<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Resource Provision

**Status:** 📝 Draft
**Priority:** High
**Effort:** Large
**Type:** Feature Epic
**Tags:** byok, compute, external-providers, browser-storage, backup, hashing, quota, resource-provision, inference, storage

## Summary

Users can **provision external resources** for the running instance: computing
power, encrypted credentials, and storage endpoints so the system can execute
application functions (inference, generation, processing) and store backups,
duplicates, and redundancy **in accordance to per-user quota**. A companion
browser-storage backup path lets users opt-in to backing up data, chats, and
assets locally, with reconciliation and recovery anchored to widely-applied
content hashing.

This epic is the **provisioning umbrella** over BYOK-style credential supply
(`epic-byok-api-keys.md`, `epic-byok-local-models.md`), external compute
(`epic-distributed-compute-sharing.md`), and content-hash-based integrity
(`epic-content-hashing-distributed-integrity.md`). It adds the **quota envelope**,
the **provider-routing facade**, and the **browser backup / reconciliation /
recovery** lifecycle that tie those subsystems together under a single user-facing
resource model.

## Core Problems

### External Compute & Inference Provisioning

- The generation pipeline serves LLM + SD/ComfyUI via platform-owned providers
  only (`src/generation/providers/registry.ts`).
- Users with private or specialised models / hardware cannot feed that capacity
  into the instance for themselves **or** for other users without a provisioned
  path.
- There is no first-class "resource record" that binds a user-supplied endpoint,
  credential, and quota ceiling to a runnable provider slot.

### Encrypted Credential Supply

- External inference and storage providers require keys/tokens that are
  sensitive.
- Keys must never reach the server in plaintext; the server must hold only a
  verifiable reference (hash / wrapped key) sufficient to route and rate-limit.
- Existing BYOK stores keys in browser storage only; this epic extends the model
  to **storage-provider credentials** and to **server-side verifiable references**
  that survive session boundaries.

### Storage Redundancy & Backup via Browser

- Users want off-device copies of chats, assets, and world data they have
  authored.
- Browser storage (`localStorage` / IndexedDB) is the simplest opt-in target: no
  server dependency, no separate account, works offline.
- Backups must be **detectably recoverable** — reconciliation on reload must
  identify drift and trigger recovery, anchored to content hashes rather than
  fragile timestamps or filenames.

### Quota Enforcement

- Unbounded external-resource consumption is a denial-of-service risk and a
  billing problem.
- Each provisioned resource must carry a quota ceiling (requests/min, tokens/min,
  storage bytes, compute-hours) enforced at the routing layer before any external
  call is made.

## Design

### Resource Record Model

Every provisioned external resource is represented as a **resource record**:

```typescript
interface ResourceRecord {
  id: string;                    // deterministic hash of (owner | type | params)
  ownerId: string;               // provisioning user
  type: "inference" | "storage" | "compute";
  provider: string;              // e.g. "openai" | "anthropic" | "self-hosted-llm" | "s3"
  endpoint: string;              // base URL / ARN / path
  credentialRef: string;         // hash / wrapped-key reference — never plaintext
  quota: ResourceQuota;
  status: "active" | "paused" | "revoked" | "error";
  createdAt: Date;
  lastUsedAt?: Date;
}

interface ResourceQuota {
  requestsPerMinute: number;
  tokensPerMinute?: number;
  storageBytes?: number;
  computeHours?: number;
  concurrency?: number;
}
```

- Resource records are **user-scoped**: a user can only see and use their own.
- `credentialRef` is a one-way reference (SHA-256 of the raw credential, or a
  key-wrapped reference via `src/crypto/byok.ts`). The server never holds the
  raw secret.
- `id` is a deterministic hash so the same logical resource is always the same
  record across sessions — this is the anchor for quota tracking and billing.

### Provider Routing Facade

A thin `src/generation/resource-provider.ts` layer sits in front of the
existing `registry.ts`:

```
callWithResource(resourceId, request)
  → resolveResource(resourceId)          // fetch record, verify quota, credential
  → enforceQuota(resourceId, request)    // decrement counters, reject if over
  → routeToProvider(record, request)     // existing provider routing / BYOK path
  → recordUsage(resourceId, usage)       // update quota counters
  → onQuotaExceeded → fallback / reject
```

- Reuses `resolveProvider` / `buildFailoverList` / `callWithFailover` from the
  existing registry — the facade **composes**, not replaces.
- Quota enforcement happens **before** the external call; quota breach returns a
  structured `QuotaExceededError` (not a provider 429).

### Browser Backup (Opt-In)

Users explicitly opt-in to browser backup via a settings toggle. When enabled:

1. **Export** — serialize the requested data (chats, assets metadata, world
   snapshots) into a structured blob.
2. **Hash** — compute a content hash (SHA-256) over the blob.
3. **Store** — persist the blob + hash in the browser's IndexedDB under a
   `ll-backup::` namespace, keyed by `(resourceId, version, hash)`.
4. **Reconcile** — on reload / explicit "verify" action, re-hash the stored blob
   and compare to the canonical server-side record hash (`X-Record-Hash` from
   `epic-content-hashing-distributed-integrity.md`). Match = consistent;
   mismatch = drift detected.
5. **Recover** — on drift or user request, restore from the browser backup
   into the active dataset, re-hashing and re-registering.

```typescript
interface BackupRecord {
  id: string;                    // ll-backup::<ownerId>::<resourceId>::<version>::<hash>
  resourceType: "chat" | "asset" | "world" | "lore";
  ownerId: string;
  contentHash: string;           // SHA-256 of the payload
  serverHash?: string;           // last-known server X-Record-Hash (for reconciliation)
  payload: string;               // serialized backup blob
  version: number;
  createdAt: Date;
  storageQuotaBytes: number;     // size of this backup
}
```

### Reconciliation & Recovery Lifecycle

| State | Meaning | Action |
| --- | --- | --- |
| `consistent` | local hash == server hash | no-op |
| `drifted` | local hash != server hash | surface to user; offer restore-from-server or overwrite-server |
| `orphaned` | local hash has no server counterpart | offer to push (create) |
| `stale` | local version < server version | offer pull (update local) |

Recovery is **user-confirmed** for every merge decision — never silent.

### Quota Enforcement Points

1. **Resource resolution** — reject if `status !== "active"`.
2. **Pre-call guard** — reject if any quota counter is exhausted.
3. **Post-call accounting** — increment counters on successful call.
4. **Background sweeper** — reset per-minute counters on window boundary;
   persist cumulative counters to the server hash record for durability across
   sessions.

## Features

### External Inference Provisioning

- Add / list / revoke external inference endpoints (LLM, SD/ComfyUI)
- Credential stored as hash / wrapped reference only
- Quota ceiling enforced per-resource at the routing facade
- Fallback to platform default when resource is paused/revoked/quota-exhausted

### External Storage Provisioning

- Add / list / revoke external storage endpoints (S3-compatible, WebDAV, etc.)
- Backup destination registration with quota (storage bytes)
- Automatic backup scheduling (on chat end, on asset upload, on world save) —
  configurable
- Integrity check via content hash on every backup write

### Browser-Storage Backup (Opt-In)

- Settings toggle to enable/disable browser backup
- Per-resource-type selectors (chats, assets, world data, lore)
- Export to IndexedDB with content hashing
- Reconciliation dashboard: show consistent / drifted / orphaned / stale items
- One-click recovery with confirmation

### Quota Management

- Per-resource quota ceilings (requests, tokens, storage, compute-hours, concurrency)
- Real-time quota gauge in resource settings
- Quota exhaustion notification with fallback behavior
- Admin override capability (for community hosts)

### Reconciliation & Recovery

- Background hash reconciliation on reload
- Drift detection with user-facing report
- Safe recovery (user-confirmed per-item)
- Backup rotation (keep N most recent per resource)

## Tasks

- [ ] `TASK-resource-provision-schema` — resource record schema + Kysely migration
  (`resource_records`, `backup_records`, quota counter tables)
- [ ] `TASK-resource-provision-credential-store` — hash/wrapped-reference credential
  store; integrate with `src/crypto/byok.ts`; never persist raw secrets
- [ ] `TASK-resource-provision-routing-facade` — `src/generation/resource-provider.ts`
  facade composing with `registry.ts`; quota pre-call guard + post-call accounting
- [ ] `TASK-resource-provision-quota-engine` — quota counter service; per-minute reset;
  persistence; `QuotaExceededError`
- [ ] `TASK-resource-provision-external-inference` — inference endpoint provisioning UX
  + routes (add/list/revoke/test)
- [ ] `TASK-resource-provision-external-storage` — storage endpoint provisioning +
  backup scheduling + integrity check
- [ ] `TASK-resource-provision-browser-backup` — IndexedDB backup export + hash +
  opt-in settings toggle
- [ ] `TASK-resource-provision-reconciliation` — background hash reconciliation; drift
  detection; consistency dashboard
- [ ] `TASK-resource-provision-recovery` — user-confirmed recovery flow; backup rotation
- [ ] `TASK-resource-provision-quota-ui` — quota gauge, notifications, admin override
- [ ] `TASK-resource-provision-tests` — unit + integration tests for routing facade,
  quota engine, backup, reconciliation, recovery
- [ ] `TASK-resource-provision-e2e` — end-to-end round-trip: provision → call → quota
  enforcement → browser backup → reconcile → recover

## Files

- `src/db/migrations/` — `resource_records`, `backup_records`, quota counter tables
- `src/generation/resource-provider.ts` — routing facade
- `src/generation/quota-engine.ts` — quota service
- `src/resource/` — credential store, external inference, external storage
- `src/backup/browser-backup.ts` — IndexedDB export + hash
- `src/backup/reconciliation.ts` — drift detection
- `src/backup/recovery.ts` — recovery flow
- `src/frontend/settings/resource-provision.ts` — provisioning UI
- `src/frontend/settings/browser-backup.ts` — backup toggle + dashboard
- `docs/spec/resource-provision.md` — detailed spec

## References

- `epic-byok-api-keys.md` — BYOK credential model (extended to storage providers)
- `epic-byok-local-models.md` — BYOK local model path
- `epic-distributed-compute-sharing.md` — contributor compute network (sharing is the
  mirror of provisioning)
- `epic-content-hashing-distributed-integrity.md` — canonical record hash +
  `X-Record-Hash` used in browser backup reconciliation
- `epic-crypto.md` / `epic-encryption-workflow.md` — credential wrapping primitives
- `epic-platform-integrations.md` — third-party marketplace provisioning (the
  "rent" direction, complementary to this "contribute/provision" direction)
- `src/generation/providers/registry.ts` — existing provider registry the facade composes with
