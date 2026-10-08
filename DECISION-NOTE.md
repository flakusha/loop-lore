# DECISION-NOTE: deferred removal of epic-local-multi-instance-federation

Parked deletion intent — do NOT finalize until the owning decision is made.

## Deleted on this branch

- `.plan/epics/epic-local-multi-instance-federation.md`
- `docs/review/federation-local-multi-instance-review.md`

## (a) 12 TASK tickets referencing `**Epic:** epic-local-multi-instance-federation`

1. TASK: Add a federation e2e test that boots two real servers (`TASK-add-a-federation-e2e-test-that-boots-two-real-servers.md`)
2. TASK: Add a two-instance local federation dev harness and runbook (`TASK-add-a-two-instance-local-federation-dev-harness-and-runbook.md`)
3. TASK: Add consent route and UI to grant and revoke chat federation consent (`TASK-add-consent-route-and-ui-to-grant-and-revoke-chat-federation.md`)
4. TASK: Add federation to the config DOMAINS list so config.federation.toml loads (`TASK-add-federation-to-the-config-domains-list-so-config-federati.md`)
5. TASK: Allow DATA_DIR to be overridden by env var (`TASK-allow-data-dir-to-be-overridden-by-env-var.md`)
6. TASK: Bootstrap mesh_peers from config.federation.peers at boot (`TASK-bootstrap-mesh-peers-from-config-federation-peers-at-boot.md`)
7. TASK: Correct dead file references and store shape drift in the instance switcher spec (`TASK-correct-dead-file-references-and-store-shape-drift-in-the-in.md`)
8. TASK: Expose DEK export and import over the federation wire routes (`TASK-expose-dek-export-and-import-over-the-federation-wire-routes.md`)
9. TASK: Isolate auth cookies per local instance so two dev servers do not clobber each other (`TASK-isolate-auth-cookies-per-local-instance-so-two-dev-servers-d.md`)
10. TASK: Make the federation config panel editable in the config UI (`TASK-make-the-federation-config-panel-editable-in-the-config-ui.md`)
11. TASK: Persist delivered mesh payload in mesh_deliveries, not metadata only (`TASK-persist-delivered-mesh-payload-in-mesh-deliveries-not-metada.md`)
12. TASK: Wire the chat write path to fanOutContent as the production sender trigger (`TASK-wire-the-chat-write-path-to-fanoutcontent-as-the-production-.md`)

## (b) Options (decision deferred)

1. **Restore the epic** — revert this branch's epic deletion and keep the 12 tickets as-is.
2. **Re-point tickets to a replacement** — e.g. `epic-instance-federation` or `epic-federation-swarm-sync` — then delete the epic file.
3. **Rename** — introduce the replacement epic name and move the tickets onto it.

## (c) Linkage-gate warning

Committing the deletions as-is dangles the 12 tickets above: their `**Epic:**`
headers would point at a nonexistent epic file and the linkage gate would fail.
Resolve (restore / re-point / rename) before merging this branch.
