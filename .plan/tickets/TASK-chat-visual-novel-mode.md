<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Chat: Visual Novel Mode

**Status:** 🟡 Partial — frontend VN renderer foundation complete (6 files in src/frontend/vn/), choice/branching UI + chat.html wiring pending
**Priority:** medium
**Effort:** Medium-High (frontend rendering)
**Epic:** epic-immersion-presentation

## Summary

Visual novel mode: image + text overlay, transitions, typewriter effect, 3 layout modes. Backend complete, frontend rendering foundation complete (2026-07-31).

## Scope

### Backend (Complete)

- VN mode state management
- Scene transition logic
- Choice/branching system

### Frontend (Foundation Complete, Wiring Pending)

- ✅ VN renderer component (`src/frontend/vn/scene-renderer.ts`)
- ✅ Image display with transitions (`src/frontend/vn/transition-engine.ts`)
- ✅ Text overlay with typewriter effect (`src/frontend/vn/typewriter.ts`)
- ❌ Choice/branching UI (not started)
- ✅ 3 layout modes (overlay, below, split) — CSS + renderer
- ❌ Not yet wired into `chat.html` (conditional VN vs bubble layout)

### Layout Modes (with viewport-aware placement)

- **Full (overlay)** — Image fills viewport, text in semi-transparent box at bottom ✅
- **Below** — Image top, text bottom. Use this as the **default for portrait / narrow viewports** (e.g. typical phone / chat-sized window). Background uses landscape aspect; portrait image is letterboxed. ✅
- **Split** — Portrait left/right, text opposite side. **Promote automatically to `split` when viewport aspect ratio is wide enough** (e.g. `aspect-ratio >= 16:10`, viewport width ≥ 1024px, or user toggled manually). Character portraits should be **stretched vertically** (preserve aspect, `object-fit: contain`); the *background* image, by contrast, is the only one that should fill horizontally.

#### Viewport-driven placement

| Viewport shape | Default mode | Reasoning |
|---|---|---|
| Portrait / narrow (aspect < 4:3 or width < 768px) | `below` | Background fills top, text reads full-width below — readable on phones. |
| Square / small landscape (4:3 ≤ aspect < 16:10, 768–1024px) | `below` | Same rationale; `split` would crowd the portrait. |
| Wide landscape (aspect ≥ 16:10, width ≥ 1024px) | `split` (auto-promote) | Portrait on one side, text on the other; both readable, no squashing. |
| Ultra-wide / chat-in-tab (aspect ≥ 21:9) | `split` with portrait-emphasis column | Keep portrait at ~35–40% width; reduce background width. |

User can override via the chat-settings modal; the override wins for the
session but the auto-promotion heuristic re-evaluates on `resize` (debounced
to 200ms) unless the user has manually selected a mode in this session.

#### Portrait vs background image handling

| Asset type | Recommended `object-fit` | Notes |
|---|---|---|
| Background (location / scene) | `cover` (with `object-position`) | Crop to fill viewport; reposition per scene if metadata provides anchor. |
| Character portrait | `contain` (vertical-first) | **Stretch vertically is the visual goal** for VN aesthetics; never crop the head/feet. Default size: 30–40% of scene width. |
| Inline attachment (image inserted in dialogue) | `contain` | Inline with text; max-height = remaining-text-area. |

#### Why portrait-vertical matters

VN character portraits are conventionally taller-than-wide (e.g. 3:4 or
2:3 aspect). When the column is narrower than the natural portrait
aspect, the renderer should let the portrait *grow vertically* (CSS
`height: 100%`, `width: auto`, `max-height: 90%`) rather than squashing
it horizontally. The current `portrait-manager.ts::applyPortraitLayout`
uses `gridTemplateColumns` ratios only; the next VN cycle should add
portrait-vertical sizing and a `resize` observer that re-applies layout
when the chat window resizes.

## State Machine Approach (Confirmed)

VN mode composes three concurrent finite state machines (FSMs). Each FSM
is scoped to one concern (navigation, transition, typing) and exposes a
`status` plus explicit `state()` accessor. A top-level **VN Combined FSM**
composes them and is the only public surface consumed by `chat.html` /
Alpine bindings. The combined FSM uses orthogonal regions (Harel
statecharts) so navigation can advance while a transition is mid-flight
while typing is still rendered — exactly what users expect from a
cinematic chat mode.

### State machines

| FSM | States | Events | Notes |
|---|---|---|---|
| **Scene Navigation** | `idle`, `navigating`, `settling` | `NEXT`, `PREV`, `JUMP(idx)`, `RESET`, `LOCATION_CHANGED` | Owns `state.currentIndex`. Holds navigation while a transition is mid-flight; advances only after `settling`. |
| **Transition Engine** | `idle`, `animating`, `done`, `cancelled` | `BEGIN(type)`, `END`, `CANCEL`, `REDUCE_MOTION` | Drives `transitionScene()`; `cancelled` is reachable from `REDUCE_MOTION` and reaches `idle` synchronously (the cut path). |
| **Typewriter** | `idle`, `animating`, `complete`, `skipped` | `START(text)`, `CHAR`, `PAUSE_PUNCT`, `END`, `SKIP` | `skipped` resolves the active promise and exposes full text immediately. `complete` fires `onComplete` and yields control back to navigation. |
| **VN Combined FSM** | `disabled`, `booting`, `idle`, `transitioning`, `typing`, `awaiting-advance`, `navigating`, `destroyed` | `INIT`, `MESSAGE_IN`, `NAVIGATE`, `TRANSITION_BEGIN`, `TRANSITION_END`, `TYPEWRITER_BEGIN`, `TYPEWRITER_END`, `SKIP`, `LOCATION_CHANGED`, `DESTROY` | Orthogonal composition of the three sub-FSMs plus a top-level `enabled` guard. |

### Harel statechart semantics

```mermaid
stateDiagram-v2
    [*] --> disabled
    disabled --> booting: INIT
    booting --> idle: ready
    idle --> typing: MESSAGE_IN (auto-advance off)
    idle --> awaiting-advance: MESSAGE_IN (auto-advance on)
    idle --> navigating: NAVIGATE
    navigating --> transitioning: TRANSITION_BEGIN
    transitioning --> typing: TRANSITION_END + typing-active
    transitioning --> idle: TRANSITION_END + idle
    typing --> awaiting-advance: TYPEWRITER_END + auto-advance on
    typing --> idle: TYPEWRITER_END + auto-advance off
    awaiting-advance --> navigating: tick / NAVIGATE
    awaiting-advance --> idle: SKIP
    typing --> idle: SKIP
    any --> destroyed: DESTROY
    destroyed --> [*]
```

### Type contract (proposed)

```ts
// src/frontend/vn/state-machine/types.ts (new)
export type VnLifecycleState =
  | "disabled"
  | "booting"
  | "idle"
  | "transitioning"
  | "typing"
  | "awaiting-advance"
  | "navigating"
  | "destroyed";

export interface VnLifecycleEvent {
  type:
    | "INIT" | "MESSAGE_IN" | "NAVIGATE" | "TRANSITION_BEGIN"
    | "TRANSITION_END" | "TYPEWRITER_BEGIN" | "TYPEWRITER_END"
    | "SKIP" | "LOCATION_CHANGED" | "DESTROY";
  payload?: unknown;
}

export interface VnLifecycleContext {
  readonly current: VnLifecycleState;
  readonly sceneIndex: number;
  readonly isTypewriting: boolean;
  readonly isTransitioning: boolean;
  readonly reducedMotion: boolean;
  subscribe(listener: (ctx: VnLifecycleContext) => void): () => void;
  dispatch(event: VnLifecycleEvent): void;
}
```

### Implementation outline

1. **Discrete sub-FSMs first.** Move the existing module-state singletons
   (`scene-renderer/state.ts`, `transition-engine.ts`, `typewriter.ts`)
   into per-FSM reducer shapes. Each FSM exports `reduce(state, event)`;
   no side effects in the reducer (effects go through a `step()` helper).
2. **Combined FSM wrapper.** `src/frontend/vn/state-machine/index.ts`
   exposes `createVnLifecycle()` that owns the three sub-FSMs and emits a
   single `VnLifecycleContext` to subscribers. `syncVnRenderer` in
   `alpine/chat-settings/vn.ts` switches to `lifecycle.subscribe(...)` —
   this is the wiring fix that replaces the existing imperative re-init.
3. **`prefers-reduced-motion` integration.** The reducer consults
   `reducedMotion` to short-circuit `transitioning`/`typing` to
   synchronous terminal states, preserving the existing cut/skip behaviour
   in a declarative form.
4. **Test coverage.** Add `src/frontend/vn/state-machine/state-machine.test.ts`
   covering: illegal transitions rejected, `DESTROY` terminal from any
   state, `REDUCE_MOTION` collapses transition + typewriter, orthogonal
   navigation during `transitioning`, `SKIP` resolves outstanding promises.
5. **Backward compatibility.** The legacy imperative `initVnRenderer` /
   `nextScene` / `prevScene` API stays exported as a thin shim over the
   FSM until `chat.html` and `command-palette.ts` migrate — then drop
   the shim in a follow-up cycle.

### Why a combined FSM, not three independent ones

- **Reasoning under concurrent events.** Today, a `chat:location-changed`
  fires while a typewriter is animating can race the reducer in
  `controller.ts` (`addScene` mutates `state.scenes` while
  `renderCurrentScene` reads it). A combined FSM makes the race
  impossible: events are serialized into a single dispatch queue.
- **Testable transitions.** Each transition is a pure function. The
  existing module-state singletons are awkward to test (global mutation).
- **`prefers-reduced-motion` as a first-class guard** instead of three
  separate `if (prefersReducedMotion())` early-returns scattered across
  the three modules.

## Linked Epics

- `epic-immersion-presentation.md`

## Acceptance Criteria

- [x] VN renderer component implemented
- [x] Image display with transitions (fade, slide, etc.)
- [x] Text overlay with typewriter effect
- [ ] Choice/branching UI
- [x] 3 layout modes (overlay, below, split)
- [x] Scene transition animations
- [ ] Mobile-responsive design (needs testing)
- [ ] Integration with backend VN state (needs chat.html wiring)
- [ ] Unit tests for VN renderer
- [ ] Integration tests for VN workflow

## Notes

- Backend is complete — frontend foundation done 2026-07-31
- VN module at `src/frontend/vn/` — 6 files: settings, typewriter, transition-engine, portrait-manager, scene-renderer, index
- GmConfig extended with 12 VN fields; ChatState extended with VN state
- Next: wire into `chat.html` for conditional VN vs bubble rendering
