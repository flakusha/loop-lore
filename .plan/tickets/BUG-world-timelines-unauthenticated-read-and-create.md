# BUG: world timelines unauthenticated read and create

**Status:** ✅ Resolved (commit 88544034 — GET list/POST create GET-by-id gated on extractAuth + requireWorldAccess/Owner)
**Priority:** critical
**Effort:** Small

## Summary

Location: src/routes/worlds/timelines.ts (timelinesRoutes: GET/POST /worlds/:worldId/timelines, GET /worlds/:worldId/timelines/:timelineId). DELETE is guarded; the read/create/read-by-id handlers are not.

Symptom: GET (list), POST (create), and GET-by-id handlers call the DB directly by world_id with no extractAuth / requireWorldAccess / requireWorldOwner. The global .derive only populates ctx.userId (null on auth failure) and never rejects. Result: ANY unauthenticated caller can enumerate and INSERT timeline branches into ANY world (info disclosure + unauthorized data injection). Confirmed by direct source read; route is mounted live via worlds/index.ts -> registerPlugins.

Root cause: timelines route group was added without the ownership guards that sibling worlds/locations routes use.

Fix: Mirror siblings — extractAuth(ctx) then requireWorldAccess (reads) / requireWorldOwner (create) before each op; return 404 (reads) / 403 (writes) on denial.

Acceptance: unauthenticated requests to the three handlers return 401; a logged-in non-owner gets 404/403; owner succeeds; regression test (cross-world + unauth) added.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
