<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: LLM Request Throughput & Message Scheduling

**Tags:** llm, queue, scheduler, rate-limiting, concurrency
**Overview:** (see sections below)


**Status:** Not Started
**Status Note:** Not Started
**Priority:** Medium
**Effort:** Large
**Issue:** `6ed8545`
**Type:** Feature Epic

## Summary

LLM request throughput management and message scheduling/queuing system. Handle local inference limitations with queued/pending processing states, extend message state machine, and support paused generation with scheduled message downgrade.

## Core Problems

### Local Inference Limitations

- Local LLMs (Ollama, llama.cpp, etc.) have limited throughput
- Concurrent requests can overwhelm local inference
- Need intelligent queuing and scheduling

### Message State Machine Extension

- Current states: pending, generating, complete, failed
- New states: queued, scheduled, paused
- State transitions and validation

### Paired Chat Generation

- Multiple chats may compete for LLM resources
- Need priority-based scheduling
- Paused chats should yield to active chats

## Design

### Message States (Extended)

```
Message States:
├── pending — initial state, waiting to be sent
├── queued — waiting for LLM slot (new)
├── scheduled — scheduled for later generation (new)
├── generating — actively being generated
├── paused — generation paused, waiting to resume (new)
├── complete — generation finished
├── failed — generation failed
├── cancelled — generation cancelled
```

### Queue System

```
Queue Architecture:
├── Priority Queue
│   ├── Active chat (high priority)
│   ├── Scheduled messages (medium priority)
│   └── Background tasks (low priority)
├── Rate Limiter
│   ├── Per-provider limits
│   ├── Concurrent request limits
│   └── Token budget limits
└── Scheduler
    ├── Time-based scheduling
    ├── Priority-based scheduling
    └── Resource-aware scheduling
```

### State Transitions

```
pending → queued → generating → complete
pending → scheduled → queued → generating → complete
generating → paused → queued → generating → complete
generating → failed
generating → cancelled
```

### Paired Chat Behavior

```typescript
interface ChatGenerationConfig {
  chatId: string;
  priority: "high" | "medium" | "low";
  maxConcurrent: number;
  pausedGeneration: boolean;
  scheduledMessages: ScheduledMessage[];
}

interface ScheduledMessage {
  id: string;
  scheduledAt: Date;
  priority: number;
  state: "scheduled" | "queued" | "paused";
}
```

### Resource Management

```typescript
interface LLMResourceManager {
  // Track active requests per provider
  activeRequests: Map<string, number>;

  // Queue pending requests
  requestQueue: PriorityQueue<LLMRequest>;

  // Rate limiting
  rateLimiter: RateLimiter;

  // Scheduling
  scheduler: MessageScheduler;

  // State management
  stateMachine: MessageStateMachine;
}
```

## Features

### Queue Management

- Priority-based request queuing
- Fair queuing across chats
- Queue depth monitoring
- Queue overflow handling

### Rate Limiting

- Per-provider rate limits
- Concurrent request limits
- Token budget limits
- Adaptive rate limiting

### Scheduling

- Time-based message scheduling
- Priority-based scheduling
- Resource-aware scheduling
- Schedule persistence

### State Machine

- Extended message states
- State transition validation
- State persistence
- State recovery on restart

### Paused Generation

- Pause active generation
- Resume paused generation
- Yield to higher priority
- Scheduled message downgrade

### Monitoring

- Queue depth metrics
- Request latency tracking
- Throughput monitoring
- Resource utilization

## Tasks

- [ ] Design queue architecture
- [ ] Implement message state machine extension
- [ ] Implement priority queue
- [ ] Implement rate limiter
- [ ] Implement message scheduler
- [ ] Implement paused generation
- [ ] Implement resource manager
- [ ] Add queue monitoring
- [ ] Add scheduling UI
- [ ] Add queue management UI
- [ ] Write tests for queue system
- [ ] Write tests for state machine
- [ ] Write tests for scheduler

## Files

- `src/llm/` — LLM management modules (expand existing)
- `src/llm/queue.ts` — request queue
- `src/llm/scheduler.ts` — message scheduler
- `src/llm/rate-limiter.ts` — rate limiting
- `src/llm/resource-manager.ts` — resource management
- `src/llm/state-machine.ts` — message state machine
- `src/db/schema-queue.ts` — queue tables
- `src/routes/queue.ts` — queue API endpoints
- `src/frontend/queue/` — queue UI components
- `docs/spec/llm-queue.md` — queue specification

## References

- `docs/spec/implementation.md` — implementation spec
- `docs/spec/generation.md` — generation spec (if exists)
- `src/generation/` — existing generation modules

## Linked Tasks

- TASK-llm-queue.md

## Security Considerations

- **Per-provider cap is an in-process semaphore Map with no cross-process coordination** → single-writer / leader election for slot accounting (src/llm/concurrency-limiter.ts:10-11)
- **Duplicate-request detection is an in-process liveIds Set, so a restart or second instance re-enqueues same message** → idempotency key persisted at admission (src/llm/resource-manager.ts:52-53)
- **Queue and running-handle state is memory-only (no persistence); a restart drops queued work while the row reads queued** → idempotency key on redispatch (src/llm/resource-manager.ts:17-19)

## Related Epics

- `epic-actor-autonomy-story-drive.md` — related
- `epic-analytics-observability.md` — related
- `epic-generation-flow-control.md` — related
