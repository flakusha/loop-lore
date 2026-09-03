# Confirmation round — dead/duplicated code triage (2026-09-03)

Companion to `README.md` in this directory. Run against merged-state preview
(worktree `knip-jscpd-fixes` @ rebased onto dev `f2deabc5`, with the new
package.json scripts). Raw post-fix report (worktree removed at finalize;
copy lives here as `jscpd-report-post-fix.json`).
Finalized to dev as `3f640da9` (fast-forward, signed; checks/tests skipped via
`--force` on user greenlight — the only failures were pre-existing dev drift in
`seen.test.ts`/`post-store.test.ts`/`apply.ts`, unrelated to these two files).

**STATUS: ALL DECISIONS PROMOTED TO GIT TICKETS (2026-09-03, dev `485c0bac`).**
D1→TASK-dedup-route-handler-boilerplate-via-shared-route-factory (blocked on
mid-wiring confirmation); D2→TASK-refactor-llm-provider-adapters-onto-shared-base-factory
(base/factory preferred; docs/.plan update requirement included); D3→TASK-single-source-of-truth-for-config-schema-mirrors;
D4→TASK-consolidate-template-constants-under-global-all-constants-um (umbrella design:
data-not-code, eslint-skipped, startup-linked, configs/-overridable); D5+D6→TASK-dedup-invites-redeem-and-auth-form-flows
(approved quick win); D7→TASK-extract-htmx-view-fragments-from-duplicated-html-views (later);
knip types gag→implemented+committed on branch knip-types-signal (aa9646f6; gag removed,
1 real finding, no tags needed); plugins→KEEP-WIRE + TASK-scan-epics-for-plugin-api-surface-candidates;
ratchet→stays advisory; dev red→owner session (out of scope; + BUG-check-parallel-gpg-preflight-crashes-on-undefined-m).
This file is research evidence only.

Post-fix gate mode now reads: 2009 clones / 15,345 dup lines / 7.95% in 1795
files — locales/CSS/generated mass gone; `src/frontend/**` retained
(verified first-party code, NOT vendored — earlier review note was wrong).

## Decision policy (user directive)

Dead/duplicated code MAY be unfinished functionality to be finalized and
connected later. Nothing is removed or refactored without per-item
confirmation in a later round. Each item below carries a triage verdict
proposal: KEEP-WIRE (likely unfinished feature → connect later), REFACTOR
(genuine duplication worth consolidating), or REMOVE (true dead).

## knip — dead code surface

knip reports only ONE dead-code item repo-wide (exit 0); everything else is
already ignore-managed. Confirmation queue:

| Item | Location | Verdict proposal | Rationale |
|---|---|---|---|
| Plugin sample types | `plugins/**/types.ts` (ignored in knip.json, "Tracked: TASK-knip-dead-code") | **KEEP-WIRE** | Deliberate extension-surface scaffolding; no consumer yet but planned plugin API — do NOT delete |
| Types analysis | `exclude:["types"]` in knip.json | **KEEP-WIRE** | Global gag; test-factory barrels re-export `*Factory` types as public API. Restore per-symbol `@knipignore` tags when convenient to regain type dead-code signal |
| Dev leftover | `scripts/check-parallel-HEAD-probe.mjs` | **REMOVE** (user's dev checkout — was flagged in prior round; verify it is still untracked before deleting) | Untracked scratch from HEAD-probe experiment; violates `.tmp/` scratch convention |

## jscpd — top duplication clusters (by dup tokens)

All from the 2009-clone post-fix report. Largest first; each needs a
keep-wire vs refactor decision from the user before any action.

| # | Cluster | Dup tokens | Files | Proposal |
|---|---|---|---|---|
| D1 | Route-handler boilerplate: auth→ownership→validate→error-map repeats across `routes/rpg` 11.0k, `routes/admin` 8.5k, `routes/views` 5.8k, `routes/chats` 4.8k, `routes/crafting` 3.9k, `routes/nsfw-moderation` 3.4k, `routes/battle` 3.2k; worst single file `routes/actor-items/service.ts` 5.8k/77 clones | ~45k | ~200 | REFACTOR: shared route factory — but ONLY after confirming no route family is mid-wiring (unfinished functionality could be the reason handlers repeat) |
| D2 | LLM provider adapters: `generation/providers/{anthropic,ollama-native,openai-compatible}/{index,http}.ts` cross-clones (237t/69l, 216t/55l, 166t/23l) | 6.3k | 9 | REFACTOR: provider base/factory; KEEP-WIRE check first — new providers (federation/swarm ticket) may land similar shapes |
| D3 | Config schema mirror: `config/schema-class/json-schema/generation.ts` ↔ `config/sections/generation/{sd,llama}.ts` (409t/54l, 342t/37l) | ~5.5k | ~6 | REFACTOR: single source + codegen (DB schema codegen pattern already in repo); NOTE stash@{0} touches `config/schema-class/json-schema/{assets,db,index,server}.ts` right now — do not enter before that work lands |
| D4 | Image-edit builtin templates: `{img2img,inpaint,controlnet,txt2img}.ts` (300t/60l, 197t/33l, 187t/49l) | ~2.5k | 4 | REFACTOR: template registry + per-mode overrides; KEEP-WIRE check — sd/llama sections under active edit (stash@{0}) |
| D5 | Invites: `chat/invites/redeem.ts` ↔ `chat/world-invites/redeem.ts` 216t/23l near-exact | 0.4k | 2 | REFACTOR: parameterize shared flow |
| D6 | Auth form: `routes/auth/{login,register}.ts` 315t/73l | 0.6k | 2 | REFACTOR: shared submit/validate helper |
| D7 | HTML views: `components/chat/chat-settings-modal.html` ↔ `gm-guidance-panel.html` 526t/98l; `views/world-edit.html` 1.2k; `views/admin.html` 1.1k | ~5k | ~10 | REFACTOR: htmx partial extraction |
| D8 | Misc small: `services/server-external-manager/{lifecycle,probes}.ts` 220t/50l; `config/load/fs.ts` ↔ `config/templates-loader/discovery.ts` 197t/40l; `assets/controller/handlers.ts` 1.1k/18c | ~2k | ~8 | Case-by-case at confirmation |

## Do NOT touch while active elsewhere (from dev stash inspection)

- stash@{0} (`worktree-finalize-mtkt63rl`): config json-schema files +
  `scripts/worktree/commands/finalize.ts` + `auto-gen/post-store.test.ts` —
  touches D3/D4 files.
- stash@{1} (WIP aa9b1f6d): `message-seen` regression work + `src/routes/message-seen.ts` — touches D1's family.
- stash@{2} (`worktree-finalize-mtkquyu8`): plan tickets + `message-seen.ts`.
- Red dev gates at f2deabc5: `typecheck - backend` (TS1109 ×2),
  `lint - eslint`, `format - dprint` — pre-existing, unrelated to scripts work.
  Finalize of this branch must wait for dev green (or explicit user
  direction to force); do NOT `--force` to bury them.

## Reproduce

```bash
cd tree/knip-jscpd-fixes
bun run dead:code        # exit 0; 1 false-positive hint (src/**/*.ts, kept on purpose)
bun run dead:code:ci     # exit 0 (was: Unknown option '--ci')
bun run jscpd:full       # 2009 clones / 7.95% (was 2458 / 10.81%)
bun run jscpd            # 80 clones (was 157)
bun .tmp/knip-jscpd-research/analyze-jscpd.cjs   # rankings from any report path
```
