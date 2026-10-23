<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Sidecar reveal action stops shelling out to explorer.exe

**Status:** Blocked
**Priority:** medium
**Effort:** Small
**Epic:** epic-reference-conditioned-generation
**Related:** `TASK-sidecar-de-hardcoding-cross-platform-installer.md`, `TASK-external-comfyui-plugin-repo-integration-contract.md`, `TASK-sidecar-hardcoded-literals-configurable-defaults.md`, `TASK-sidecar-installer-node-registration.md`, `epic-reference-conditioned-generation.md`
**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

This is **plugin-repo work, out of loop-lore's scope.** The reviewed H3
stills sidecar reveals a saved take by shelling out to a Windows-only
binary, which makes the action a guaranteed exception on Linux and macOS;
replacing it with a platform-neutral reveal — open the containing directory
with the platform's file manager, or return a `file://` path the UI links
to — is work on the Python package itself, which the **2026-10-16
separate-plugin-repo decision**
(`epic-reference-conditioned-generation.md`, *Absorption decision*) assigns
to the separate ComfyUI plugin repository the repo owner will create.
loop-lore files this as a **tracked escalation** and implements **none** of
it — it never called this route, and an action loop-lore does not ship needs
no loop-lore fallback. The ticket is **Blocked because that plugin
repository does not exist yet.**

## Context

**Blocker, named explicitly:** the landing target is the **separate ComfyUI
plugin repository** — the user's own initiative, decided 2026-10-16 and
recorded in `epic-reference-conditioned-generation.md` (*Absorption
decision*, "Separate plugin repo (decision, 2026-10-16)"), with loop-lore's
consumption side fixed by
`TASK-external-comfyui-plugin-repo-integration-contract.md`. **That
repository does not exist yet**, and per the same decision loop-lore never
vendors, installs, re-ships, or patches the Python sidecar — so nothing here
can land in this repo. This ticket is the escalation record, not an
implementation plan for loop-lore.

**Source artifact status (binding, unchanged):** the Python ComfyUI
HTTP-route extension reviewed by source read on 2026-10-16, vendored **only**
under `.tmp/H3_Stills_5080_Handoff_20260930/ComfyUI-H3-Stills-Only/`. It is a
**review-only reference artifact**: never committed, `.tmp/` only, never an
import target, and nothing in `src/` may reference it.

The defect, verified against that read (2026-10-16; re-verified in this
filing): `POST /h3-stills/api/open-take` shells out
`subprocess.Popen(['explorer.exe', '/select,', str(path)], close_fds=True)`
(`__init__.py:199`), with `import subprocess` at `:4`. It first resolves the
path and requires it to sit under the ComfyUI input or output root and to be
an existing file (`:196-198`), and the response admits "selection cannot be
confirmed" (`:200-201`). The call names a Windows binary with no fallback:
on Linux or macOS it is a guaranteed exception path. `START_HERE.md`
corroborates — "Use an interactive Windows account if the Explorer button
is desired." The replacement belongs to the plugin repo: open the containing
directory with the platform's file manager, or do not shell out at all and
return a `file://` path the UI links to.

Whether the action works on any given platform is genuinely a runtime
question — no source read can answer it — so the criteria below name the
required evidence form and apply the house rule: a claim with no provenance
is not used as if confirmed.

## Acceptance Criteria

- [ ] **No platform-specific binary shell-out.** `grep -n "explorer\\.exe\|Popen\|subprocess"`
      over the plugin repo's `*.py` returns no match on the reveal path; the
      action no longer names an OS-specific executable.
- [ ] **A platform-neutral replacement ships.** The reveal either opens the
      containing directory through the platform's file manager (one guarded
      call, e.g. the `xdg-open` / `open` / `startfile` family) or returns a
      `file://` URL the SPA renders as a link — at least one of the two,
      named in the implementation notes.
- [ ] **Works on Linux and macOS.** This is the runtime claim: evidence is an
      executed test per platform (the file-manager call may be stubbed), a
      dated observation from a real launch, or a written answer from the
      upstream author. A claim with no provenance is not used as if
      confirmed.
- [ ] **The containment guard survives.** Before any reveal the path still
      resolves under the ComfyUI input/output root and must be an existing
      file (today's `__init__.py:196-198` behavior preserved, or changed on
      purpose with the reason documented). Checkable by grep plus an
      executed test — no live ComfyUI required.
- [ ] **Windows parity.** On Windows the reveal still locates or opens the
      file; evidence is an executed test, a dated observation, or a written
      answer from the upstream author, per the provenance rule.
- [ ] **Scope guard.** No acceptance criterion here asks loop-lore to write
      Python. The standing rule from
      `TASK-sidecar-de-hardcoding-cross-platform-installer.md` applies
      unchanged: if loop-lore ever builds its own reveal-a-result action it
      must not shell out to a platform-specific binary.
- [ ] **No `bun run check` gate for this work — deliberately omitted.** The
      landing repo is the plugin repo, where loop-lore's `bun run check`
      does not exist; in this repo the filing touches only `.plan/` docs,
      which the `plan:*` gates cover.
