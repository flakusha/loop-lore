# TASK: Epic: Configuration Extensions — Extensible Enumerations

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-config-extensions

## Summary

A generalized **config-extension mechanism** for value sets that are _closed but extensible_: the
system ships a built-in default set, operators/users extend it with custom values, and the
runtime/intent layer consumes a **precompiled, validated, merged enumeration** (defaults ∪
extensions) rather than discovering allowed values dynamically.

Flagship instance: **avatar emotions** — a default emotion range is auto-generated, can be extended
with new emotion values, and a per-message intent to change the avatar relies on the _full_
precompiled emotion list so any emotion (built-in or custom) can be targeted reliably.

---

## Linked Epics

- `epic-config-extensions.md`

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
