# EPIC: Assistant Generation Extensions (SD, Intent, Scenario Source)

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** High
**Type:** Feature Epic
**Tags:** assistant, stable-diffusion, intent-detection, tool-execution, scenario-source

## Overview

Extends the Assistant/GM generation surface (see `epic-assistant-gm-flows.md`)
with three capabilities not covered there:

1. **Stable Diffusion integration** — generate images/assets alongside text
   entities (items, locations, worlds, characters).
2. **Intent detection** — decide whether a user request should be routed to
   generation, to a directly-approved tool execution, or to an external API call.
3. **Scenario source** — creative LLMs generate new worlds/ideas that become
   reusable assistant scenario sources for future generation of scenarios.

This epic assumes the confirmation/quality gating flow from
`epic-assistant-gm-flows.md` still applies; it adds the _routing_ and _media_
layers on top.

## Stable Diffusion Integration

### Generation Targets

| Entity    | Asset kind     |
| --------- | -------------- |
| Character | Portrait       |
| Item      | Icon / render  |
| Location  | Scene art      |
| World     | Map / mood art |

```typescript
interface SDRequest {
  prompt: string;
  negative_prompt?: string;
  entity_ref: EntityRef;
  size: [number, number,];
  seed?: number;
}
```

## Intent Detection

### Routing Decision

| Intent                | Route                     | Approval               |
| --------------------- | ------------------------- | ---------------------- |
| Generate content      | Generation pipeline       | Quality + user confirm |
| Direct tool execution | Approved tool bus         | Pre-approved allowlist |
| External API call     | API integration framework | Per-call policy        |

```typescript
type AssistantIntent = "generate" | "tool_exec" | "api_call";

interface IntentResult {
  intent: AssistantIntent;
  confidence: number;
  target: string; // tool id or api id or generation template
  requires_approval: boolean;
}
```

## Scenario Source

Creative generation can emit reusable scenario seeds (new worlds/ideas) that the
assistant later consumes when building scenarios. Bridges into `epic-blog-system.md`
(`generated_world_seed`) and `epic-world-locations.md`.

```typescript
interface ScenarioSource {
  id: string;
  origin: "creative_llm" | "blog_seed" | "manual";
  world_sketch: string;
  reusable: boolean;
}
```

## Tasks

- [ ] Stable Diffusion request/response adapter
- [ ] Entity→asset mapping for characters/items/locations/worlds
- [ ] Intent detection model + routing table
- [ ] Approved tool-execution allowlist + policy
- [ ] External API call policy gate
- [ ] Scenario source store + reuse in generation
- [ ] Bridge scenario source ↔ blog world seed

## Files

- `src/assistant/sd.ts` — Stable Diffusion adapter
- `src/assistant/intent.ts` — intent detection + routing
- `src/assistant/tools.ts` — approved tool execution
- `src/assistant/scenario-source.ts` — scenario store (shared w/ blog)
- `src/assistant/commands/generate.ts` — extends existing generation commands
