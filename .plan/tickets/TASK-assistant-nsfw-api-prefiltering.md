# TASK: Assistant — NSFW Prefiltering for Third-Party API Workflows

**Status:** 📝 Draft
**Priority:** High (NSFW safety is a blocker for any third-party dispatch)
**Effort:** Medium
**Epic:** `epic-assistant-creative-studio-workflows`
**Depends on:** `TASK-assistant-third-party-api-integration.md`, `epic-nsfw-moderation-priority.md`

## Summary

Wire NSFW content classification, labeling, and consent into the workflow template
dispatch flow. Third-party image/video generation APIs have heterogeneous NSFW policies:

- Some **reject** NSFW outright (e.g. many SDXL endpoints, Ideogram 4)
- Some **require** explicit NSFW labeling/tags (e.g. Nano Banana, certain ComfyUI backends)
- Some **allow** NSFW with moderation flags
- Some are **NSFW-capable** but require user consent

The workflow system must classify the assembled prompt before dispatch, apply the
backend's NSFW policy, attach labels if needed, require consent for NSFW-capable backends,
and route to a fallback if the backend rejects.

## Current State (2026-08-08)

- NSFW moderation service exists: `src/nsfw/` — runtime config + live enforcement shipped
  (2026-08-03), audit-log UI + consent display shipped (2026-08-06). See
  `epic-nsfw-moderation-priority.md` and `priority.md` P0 NSFW row.
- NSFW content rating shared schema exists: `src/schemas/` (reputation, consent, NSFW
  content rating).
- No integration with third-party API dispatch — the workflow system has no NSFW policy
  field or prefilter step.
- 5-tier character NSFW rating UI is open (`.plan/backlog/open.md` row C2).

## Design

### NSFW Policy Field in Workflow Template

```yaml
dispatch:
  backend: api_call
  target: nano-banana
  endpoint: /api/generation/third-party
  nsfw_policy:
    classification_required: true # run NSFW moderation before dispatch
    allowed: true # backend accepts NSFW-labeled content
    consent_required: true # per-user consent gate before dispatch
    label_field: nsfw_label # field name in API payload
    rating_tier: explicit # NSFW content rating tier (sfw/suggestive/mature/explicit)
    fallback: # backends to try if primary rejects NSFW
      - backend: comfyui
      - backend: sd-server
```

### NSFW Policy States Per Backend

| Backend type                          | classification_required | allowed | consent_required | label_field  | fallback needed |
| ------------------------------------- | ----------------------- | ------- | ---------------- | ------------ | --------------- |
| NSFW-rejecting (Ideogram 4)           | true                    | false   | n/a              | n/a          | yes (local SD)  |
| NSFW-allowing w/ label (Nano Banana)  | true                    | true    | yes              | `nsfw_label` | yes (optional)  |
| NSFW-allowing w/ flag (ComfyUI local) | true                    | true    | per-user setting | `nsfw`       | n/a             |
| NSFW-neutral (FLUX local)             | false                   | n/a     | n/a              | n/a          | n/a             |

### Runtime Flow (NSFW-aware dispatch)

```
Workflow confirmation → User confirms
  → Assemble payload from steps + model_family preset
  → IF dispatch.nsfw_policy exists:
    → Run assembled prompt through src/nsfw/ moderation
      → If NSFW detected:
        → IF backend.allowed == false:
          → Route to fallback backend (if configured)
          → ELSE: notify user "backend rejects NSFW, try comfyui"
        → IF backend.allowed == true AND backend.consent_required == true:
          → Show NSFW consent modal (reuses epic-nsfw-moderation-priority consent UI)
        → Attach NSFW label/rating to payload[backend.label_field]
    → IF NSFW not detected OR consent given:
      → Dispatch with labeled payload
  → Dispatch result → attach as chat asset with NSFW rating tag
```

### Internal App Labeling

- NSFW content results are stored in `src/assets/` with the shared NSFW content rating
  schema (from `src/schemas/`).
- The NSFW rating travels with the asset as metadata — frontend respects user NSFW
  settings (opt-in hide, blur, etc. per `epic-nsfw-moderation-priority.md`).

## Scope

- `nsfw_policy` field in workflow `dispatch` schema
- NSFW moderation prefilter step in workflow runner dispatch
- NSFW consent gate (reuse existing consent infrastructure)
- NSFW label/rating attachment to payload + result asset
- Fallback routing when backend rejects NSFW
- Integration with `src/nsfw/` moderation service
- Tests for NSFW policy evaluation (allowed/rejected/consent)

### Non-goals

- Implementing new NSFW detection models (reuse `src/nsfw/`)
- The 5-tier character NSFW rating UI (separate `.plan/backlog/open.md` row C2)
- Changing the NSFW moderation service itself (that's `epic-nsfw-moderation-priority.md`)

## Tasks

- [ ] Add `nsfw_policy` to workflow `dispatch` schema in `src/config/sections/templates.ts`
- [ ] Implement `evaluateNsfwPolicy(prompt, policy)` in `src/assistant/workflow-runner.ts`
- [ ] Wire NSFW prefilter step before dispatch (call `src/nsfw/` moderation)
- [ ] Add NSFW consent gate using existing consent infrastructure
- [ ] Attach NSFW label to dispatch payload per `label_field`
- [ ] Implement fallback backend routing when primary rejects NSFW
- [ ] Tag result assets with NSFW content rating metadata
- [ ] Unit tests for NSFW policy evaluation (4 policy states)

## Files

| File                                                          | Status                                            |
| ------------------------------------------------------------- | ------------------------------------------------- |
| `src/config/sections/templates.ts`                            | modify (add nsfw_policy types)                    |
| `src/assistant/workflow-runner.ts`                            | modify (NSFW prefilter + consent + fallback)      |
| `src/assistant/workflow-runner.test.ts`                       | new (NSFW policy tests)                           |
| `configs/templates/workflows/defaults.yaml`                   | modify (add nsfw_policy to third-party workflows) |
| `.plan/tickets/TASK-assistant-third-party-api-integration.md` | related                                           |

## Acceptance Criteria

- [ ] `nsfw_policy` field in dispatch schema
- [ ] Prompt classified through NSFW moderation before third-party dispatch
- [ ] NSFW-capable backends require user consent (reuses existing UI)
- [ ] NSFW label attached to payload per `label_field`
- [ ] Fallback routing when backend rejects NSFW
- [ ] Result assets tagged with NSFW content rating
- [ ] Unit tests for all 4 NSFW policy states
- [ ] Nano Banana workflow has NSFW policy with consent gate

## Related

- **Epic:** `epic-assistant-creative-studio-workflows.md`
- **Task:** `TASK-assistant-third-party-api-integration.md` — third-party dispatch (depends on this for NSFW-aware payload)
- **Task:** `TASK-assistant-creative-studio-workflows.md` — workflow runner
- **NSFW Moderation Priority:** `epic-nsfw-moderation-priority.md` — NSFW moderation infrastructure, consent gate, 5-tier rating
- `priority.md` P0 NSFW row — runtime config + live enforcement shipped (2026-08-03)
- `src/schemas/` — shared NSFW content rating schema
