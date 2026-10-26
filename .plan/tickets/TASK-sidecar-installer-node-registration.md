<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Sidecar gains a real installer and node registration

**Status:** Blocked
**Priority:** medium
**Effort:** Medium
**Epic:** epic-reference-conditioned-generation
**Related:** `TASK-sidecar-de-hardcoding-cross-platform-installer.md`, `TASK-external-comfyui-plugin-repo-integration-contract.md`, `TASK-sidecar-hardcoded-literals-configurable-defaults.md`, `TASK-sidecar-reveal-cross-platform.md`, `epic-reference-conditioned-generation.md`
**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

This is **plugin-repo work, out of loop-lore's scope.** The reviewed H3
stills artifact ships no installer — no `install.sh`, no `README`, no
`requirements.txt`, no `pyproject.toml` — and registers neither
`WEB_DIRECTORY` nor `NODE_DISPLAY_NAME_MAPPINGS`, so the package is
invisible to ComfyUI and ComfyUI-Manager and an operator must already know
where to copy four `.py` files and eight web assets. Giving it a real
install path and registration is work on the Python package itself, which
the **2026-10-16 separate-plugin-repo decision**
(`epic-reference-conditioned-generation.md`, *Absorption decision*) assigns
to the separate ComfyUI plugin repository the repo owner will create.
loop-lore files this as a **tracked escalation** and implements **none** of
it — no `.py` enters this repo and no `custom_nodes/` step is added here.
The ticket is **Blocked because that plugin repository does not exist yet.**

## Context

**Blocker, named explicitly:** the landing target is the **separate ComfyUI
plugin repository** — the user's own initiative, decided 2026-10-16 and
recorded in `epic-reference-conditioned-generation.md` (*Absorption
decision*, "Separate plugin repo (decision, 2026-10-16)"), with loop-lore's
consumption side fixed by
`TASK-external-comfyui-plugin-repo-integration-contract.md`. **That
repository does not exist yet**, and per the same decision loop-lore never
vendors, installs, re-ships, or hosts ComfyUI custom nodes — so nothing here
can land in this repo. This ticket is the escalation record, not an
implementation plan for loop-lore.

**Source artifact status (binding, unchanged):** the Python ComfyUI
HTTP-route extension reviewed by source read on 2026-10-16, vendored **only**
under `.tmp/H3_Stills_5080_Handoff_20260930/ComfyUI-H3-Stills-Only/`. It is a
**review-only reference artifact**: never committed, `.tmp/` only, never an
import target, and nothing in `src/` may reference it.

The defect, verified against that read (2026-10-16; re-verified in this
filing): the whole artifact is `START_HERE.md`, four `.py` files
(`__init__.py`, `graph.py`, `studio_loras.py`, `studio_stills.py`), and
eight `web/` assets (the `FILES` set, `__init__.py:17-18`) — no
`install.sh`, no `README`, no `requirements.txt`, no `pyproject.toml`
anywhere. `WEB_DIRECTORY` and `NODE_DISPLAY_NAME_MAPPINGS` appear nowhere in
the package (grep of `__init__.py` is empty), so ComfyUI never serves the
SPA and ComfyUI-Manager never lists the repo. `NODE_CLASS_MAPPINGS = {}`
(`__init__.py:206`): the package is a route bundle contributing zero node
types. Its only dependencies are ComfyUI's own runtime — `aiohttp`,
`folder_paths`, `nodes`, `server` (`__init__.py:2-13`). `START_HERE.md`
documents the install as a manual copy into `ComfyUI/custom_nodes/` with no
additional pip package.

## Acceptance Criteria

- [ ] **Repo metadata exists.** The plugin repo carries `pyproject.toml`
      (ComfyUI-Manager-recognized: name, version, repository URL) or at
      minimum `README.md` plus `requirements.txt`. Provable by file listing
      — no live ComfyUI needed.
- [ ] **`WEB_DIRECTORY` registered.** The package entry module exports
      `WEB_DIRECTORY` pointing at the `web/` directory so ComfyUI serves the
      SPA assets. Grep-verifiable, plus an executed import test with stubbed
      `folder_paths` / `nodes` / `server` that loads the module with no
      ComfyUI process.
- [ ] **The node-mapping decision is explicit.** Either
      `NODE_DISPLAY_NAME_MAPPINGS` is registered, or `NODE_CLASS_MAPPINGS =
      {}` (`__init__.py:206`) is documented as the intended route-bundle
      shape — registration choice recorded, empty mapping with no note is a
      defect.
- [ ] **Install is executable, not prose.** An operator can install by
      running something (an install script, or ComfyUI-Manager's git-clone
      flow against the metadata above) that lands the package into
      `ComfyUI/custom_nodes/`; evidence is an executed install into a
      scratch `custom_nodes/` tree — a real ComfyUI process is not required.
- [ ] **Manager-visible.** ComfyUI-Manager can list the repo: the metadata
      names the repository URL and any requirements. Evidence is a dated
      observation of Manager listing it, or a written answer from the
      upstream author — Manager's UI is a runtime surface, so the
      provenance rule applies: a claim with no provenance is not used as if
      confirmed.
- [ ] **The dependency story is unchanged or justified.** The package still
      needs only ComfyUI's own runtime (`aiohttp`, `folder_paths`, `nodes`,
      `server`) unless a new dependency is added — any addition is listed in
      the metadata with the reason. Provable by grep over imports plus the
      metadata file.
- [ ] **Scope guard.** No acceptance criterion here asks loop-lore to ship
      an installer, to install under `custom_nodes/`, or to add any `.py` to
      this repo; `TASK-sidecar-de-hardcoding-cross-platform-installer.md`
      and `TASK-external-comfyui-plugin-repo-integration-contract.md` keep
      that boundary.
- [ ] **No `bun run check` gate for this work — deliberately omitted.** The
      landing repo is the plugin repo, where loop-lore's `bun run check`
      does not exist; in this repo the filing touches only `.plan/` docs,
      which the `plan:*` gates cover.


git issue: 17c9de6
