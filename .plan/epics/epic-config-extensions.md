# Epic: Configuration Extensions — Extensible Enumerations

**Status:** 📝 Draft — planning under `tree/chore-docs-reconcile`
**Priority:** Medium
**Effort:** Medium
**Type:** Feature Epic / Cross-cutting Framework
**Proposed Epic Branch:** `epic/config-extensions`
**Owner:** TBD
**Depends on:** existing config loader (`src/config/load.ts`) + asset system (`avatar_asset_id`); no other epic is a hard prerequisite.

---

## Summary

A generalized **config-extension mechanism** for value sets that are _closed but extensible_: the
system ships a built-in default set, operators/users extend it with custom values, and the
runtime/intent layer consumes a **precompiled, validated, merged enumeration** (defaults ∪
extensions) rather than discovering allowed values dynamically.

Flagship instance: **avatar emotions** — a default emotion range is auto-generated, can be extended
with new emotion values, and a per-message intent to change the avatar relies on the _full_
precompiled emotion list so any emotion (built-in or custom) can be targeted reliably.

---

## Current State Assessment

| Area                  | File(s)                                                              | State | Notes                                                                               |
| --------------------- | -------------------------------------------------------------------- | ----- | ----------------------------------------------------------------------------------- |
| Avatar asset refs     | `src/db/schema-core.ts` (`avatar_asset_id` on personas/actors/chars) | ✅    | Avatars are asset references only — **no emotion field exists**.                    |
| Config loader         | `src/config/load.ts`, `src/config/schema.ts`                         | ✅    | Flat config merge (file + env). No extensible-enum subsystem.                       |
| ECE primitive         | —                                                                    | ❌    | No "built-in set + extensions + precompile" primitive anywhere (semantic sweep: 0). |
| Emotion config/doc    | —                                                                    | ❌    | No emotion concept in `docs/spec/*`.                                                |
| Message detail levels | `docs/spec/messages.md`                                              | 🟡    | Detail levels exist as a concept but are not modeled as an extensible enum.         |

---

## Problem Statement

1. **No shared mechanism.** Features that need a closed-but-extensible value set (emotions, status
   effects, asset categories, detail levels) currently have no common primitive — each would
   hand-roll storage + validation + UI listing.
2. **Dynamic discovery risk.** Without a precompiled merged list, intent/UI code must discover
   allowed values at runtime, which invites drift between what is _stored_ and what is _offered_,
   plus races on config change.
3. **Upgrade fragility.** Custom values risk colliding with built-in keys or breaking when the
   built-in set changes across versions.

---

## Design: Extensible Configuration Enumeration (ECE)

A reusable subsystem with four parts:

1. **Built-in default set** — shipped, versioned, read-only keyspace per enum (e.g. emotion names).
2. **Extension store** — operator/user-defined values persisted per enum (DB table or config
   section), namespaced to avoid colliding with built-ins.
3. **Merge + precompile** — at startup (and on config change) build a validated union of
   defaults ∪ extensions, run constraint/collision checks, and cache the result.
4. **Consumer contract** — runtime/intent/UI code reads **only** the precompiled list. It never
   re-derives the allowed set; it validates against the cached enumeration.

Validation rules: no key collision with built-ins; typed payload; stable namespace; rejected
extensions surface a clear error at precompile time.

---

## Flagship Instance: Avatar Emotions

- **Default range auto-generated** — system provides a built-in emotion set (e.g. `neutral`,
  `happy`, `sad`, `angry`, `surprised`, `thinking`, `embarrassed`, …), versioned with the app.
- **Extended with new values** — operators add custom emotions (new expression/art) via config or
  an API; these join the extension store.
- **Per-message avatar intent relies on the full precompiled list** — when a message sets/changes
  the avatar emotion, the intent layer resolves against the complete merged enumeration
  (defaults ∪ custom), so any emotion is targetable and validated consistently.
- **Storage** — message-level emotion override referencing an entry from the precompiled list; the
  chosen avatar asset is selected from that emotion's definition.

---

## Other Candidate Instances

- **Message detail levels** (`docs/spec/messages.md`) — currently a concept; model as ECE.
- **RPG status effects / skill categories** (`docs/spec/rpg-mechanics.md`) — extensible enum candidate.
- **Asset categories / MIME groupings** (`src/assets/*`) — extensible taxonomy.
- **Chat command vocabulary** (`docs/spec/assistant-commands.md`) — extensible command set.

---

## Implementation Phases

### Phase 1 — ECE Primitive

| Task                                           | Files                                 | Effort |
| ---------------------------------------------- | ------------------------------------- | ------ |
| Define ECE types + built-in/default-set loader | `src/config/ece/*` (new)              | Med    |
| Extension store (DB table or config section)   | `src/db/migrations/*`, `src/config/*` | Med    |
| Merge + precompile + validate + cache          | `src/config/ece/compile.ts` (new)     | Med    |
| Collision/constraint rejection at precompile   | `src/config/ece/validate.ts` (new)    | Low    |

### Phase 2 — Avatar Emotions Instance

| Task                                                   | Files                                 | Effort |
| ------------------------------------------------------ | ------------------------------------- | ------ |
| Built-in default emotion set                           | `src/config/ece/defaults/emotions.ts` | Low    |
| Extension API/UI for custom emotions                   | `src/routes/*`, `frontend/*`          | Med    |
| Per-message avatar-emotion override (storage + intent) | `src/routes/messages.ts`, schema      | Med    |

### Phase 3 — Secondary Instances + Docs

| Task                              | Files                    | Effort |
| --------------------------------- | ------------------------ | ------ |
| Model detail levels as ECE        | `src/routes/messages.ts` | Med    |
| Author ECE + avatar-emotions docs | `docs/spec/*` (new)      | Low    |

---

## Open Questions

1. **Storage:** dedicated table per enum, or one generic `config_extensions` table keyed by enum name?
2. **Precompile trigger:** startup only, or live refresh on config change (hot reload)?
3. **Versioning:** how to reconcile built-in set changes with user extensions on app upgrade
   (keep custom, remap renamed built-ins)?
4. **Scope:** framework-wide primitive vs per-feature opt-in for v1?

---

## Recommended Priority

1. Phase 1 (ECE primitive) — unblocks every instance; medium effort, high reuse.
2. Phase 2 (avatar emotions) — flagship, proves the pattern end-to-end.
3. Phase 3 (secondary instances + docs).

---

## Next Steps

1. Promote to git EPIC issue (`epic/config-extensions`).
2. Resolve Open Questions (storage + precompile trigger).
3. Phase 1 spike: ECE types + merge/precompile on a toy enum.

---

## Dependencies

- Present: config loader (`src/config/load.ts`), asset system (`avatar_asset_id`), DB migrations.
- New: ECE subsystem (`src/config/ece/*`).

## Testing Strategy

| Test        | Coverage                                          | Files                            |
| ----------- | ------------------------------------------------- | -------------------------------- |
| Unit        | Merge/precompile correctness; collision rejected  | `src/config/ece/*.test.ts` (new) |
| Unit        | Avatar emotion override resolves from precompiled | `src/routes/messages.test.ts`    |
| Integration | Config change → precompile refresh                | `tests/integration/ece.test.ts`  |

## References

- `src/config/load.ts` — existing flat config loader
- `src/db/schema-core.ts` — `avatar_asset_id` (avatars today)
- `docs/spec/messages.md` — detail levels concept
- `docs/spec/rpg-mechanics.md` — status-effect candidate
- `docs/spec/assistant-commands.md` — command vocabulary candidate

## Related Epics

- **Epic Plugin System** — extension registration may share the ECE extension-store pattern.
- **Epic RPG Mechanics** — status effects / skill categories are natural ECE instances.
- **Epic Code Quality & Best Practices** — ECE validation should satisfy type-coverage / complexity gates.
- **Epic World Locations** — another extensible-set candidate (location types/tags).

## Scope Boundary

- **IN:** ECE primitive (defaults + extensions + precompile + cache + validation), avatar-emotions
  instance, per-message avatar-emotion intent contract.
- **OUT:** emotion art/ML generation; generic plugin SDK (Epic Plugin System owns it); per-feature
  UI beyond avatar emotions for v1; broad migration of all enums to ECE (Phase 3 is incremental).

## Linked Tasks

- TASK-config-extensions.md
