# TASK: Multi-Instance Reconciliation

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Large
**Epic:** epic-multi-instance-reconciliation

## Summary

Implementation plan for safe multi-instance operation — migration leadership, schema drift detection, and real-time sync. From `epic-multi-instance-reconciliation.md`.

## Scope

### Phase 1: Migration Leadership

- Advisory lock for migration
- Leader election
- Schema-ready waiting

### Phase 2: Schema Drift Detection

- Schema comparison
- Drift reporting
- Repair mechanisms

### Phase 3: Real-Time Sync

- Redis or sticky sessions
- Event broadcasting
- State synchronization

## Linked Epics

- `epic-multi-instance-reconciliation.md`

## Acceptance Criteria

- [ ] Advisory lock for migration leadership
- [ ] Leader election mechanism
- [ ] Schema drift detection
- [ ] Drift reporting and repair
- [ ] Real-time sync mechanism
- [ ] Event broadcasting
- [ ] State synchronization
- [ ] Unit tests for multi-instance logic
- [ ] Integration tests for multi-instance workflow

## Notes

- Reference `epic-multi-instance-reconciliation.md` for full system design
- Consider PostgreSQL vs. SQLite differences
- Balance consistency vs. availability
