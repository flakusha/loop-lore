<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Epic: API Task Offloading

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Medium
**Type:** Infrastructure Epic
**Tags:** offloading, task-queue, background-worker, disk-offload, reconciliation
**Parent Epic:** API Governance (epic-api-governance.md)

## Summary

Resource offloading for long-running tasks: task queue, background workers,
disk offload to `/tmp` (mktemp), batch reconciliation with retries, a task
status REST API, and an offloading dashboard. Keeps memory bounded and
requests non-blocking when work outlives the HTTP request.

## Sub-Epic of

Part of the **API Governance** mega-epic. See parent epic for full scope and slicing rationale.

## Scope

- Task queue
- Background worker
- Disk offload (`/tmp`, mktemp)
- Batch reconciliation
- Task status API
- Offloading dashboard

## Design

### Task Queue

```typescript
import { TaskQueue, } from "./offloading/queue";

const queue = new TaskQueue({
  backend: "sqlite", // or 'redis', 'bull'
  concurrency: 5,
},);

// Enqueue task
const taskId = await queue.enqueue({
  type: "embedding.generate",
  payload: { documentId: "doc-123", text: "...", },
  priority: "normal",
  timeout: 60000,
},);

// Get task status
const status = await queue.getStatus(taskId,);
```

### Background Worker

```typescript
import { Worker, } from "./offloading/worker";

const worker = new Worker({
  concurrency: 3,
  queues: ["embedding", "summarization", "indexing",],
},);

// Register task handlers
worker.register("embedding.generate", async (task,) => {
  // Generate embeddings
  return { embeddingId: "emb-123", };
},);

// Start worker
worker.start();
```

### Disk Offload

```typescript
import { DiskOffloader, } from "./offloading/disk";

const offloader = new DiskOffloader({
  directory: "/tmp/loop-lore",
  cleanupInterval: 3600000, // 1 hour
  maxAge: 86400000, // 24 hours
},);

// Offload large data
const path = await offloader.offload("session-123", largeData,);

// Retrieve data
const data = await offloader.retrieve(path,);

// Cleanup
await offloader.cleanup();
```

### Batch Reconciliation

```typescript
import { Reconciler, } from "./offloading/reconciliation";

const reconciler = new Reconciler({
  batchSize: 100,
  maxRetries: 3,
  retryDelay: 5000,
},);

// Reconcile batch
const result = await reconciler.reconcile({
  type: "embedding.batch",
  items: documents,
  handler: async (doc,) => {
    return await generateEmbedding(doc,);
  },
},);

// { succeeded: 95, failed: 5, errors: [...] }
```

| Feature        | Description                |
| -------------- | -------------------------- |
| Task Queue     | Background task processing |
| Disk Offload   | /tmp for large data        |
| Reconciliation | Batch processing           |

## Tasks

- [ ] Implement task queue
- [ ] Add background worker
- [ ] Create disk offload (/tmp, mktemp)
- [ ] Implement batch reconciliation
- [ ] Add task status API
- [ ] Build offloading dashboard

## Dependencies

- Parent hub: **API Governance** (`epic-api-governance.md`) — owns the shared layout, the `/api/tasks*` endpoints, and governance REST surface.
- Siblings: requires `epic-api-validation-guardrails.md` to land first; mutually independent with `epic-api-rate-limiting.md` and `epic-api-telemetry.md` afterwards.

## Files

- `src/api-governance/offloading/offloader.ts` — Task offloader
- `src/api-governance/offloading/queue.ts` — Task queue
- `src/api-governance/offloading/worker.ts` — Background worker
- `src/api-governance/offloading/disk.ts` — Disk offload (/tmp, mktemp)
- `src/api-governance/offloading/reconciliation.ts` — Batch reconciliation

## Notes

- Disk offload prevents memory exhaustion for large payloads
- Reconciliation is batch-oriented with configurable retries so partial failures recover without re-running whole batches
