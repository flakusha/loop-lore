<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Track upstream ComfyUI memory-leak issues/fixes

**Status:** Not Started
**Priority:** low
**Effort:** Small (recurring)
**Epic:** epic-comfyui-lifecycle
**Tags:** comfyui, lifecycle, memory, watchlist, sync

**Summary:**
Watchlist of upstream memory-leak-class issues relevant to this long-running
self-hosted fork: #16150 (H3 VRAM creep/OOM), #16144 follow-ups in
Comfy-Org/comfy-aimdo (#129 / PR #130), #10475 (glibc RSS retention;
malloc_trim mitigation), #14719 (LTX repeated-run freezes; kitchen CUDA /
--disable-pinned-memory), watch-rows PR#15456 and #11930. Revisit at every
fork sync; merged fixes arrive on pull and get closed out here. Records
operator-visible symptoms, the launch-flag escape hatches, and the
`POST /free` unload endpoint (with its does-not-trim-glibc-RSS caveat).

**Context:**
Owner reports strong memory leaks in long-running ComfyUI. The fork is
upstream main + local tooling (git 8604ee09, v0.43.0, comfy-aimdo 0.6.0,
comfy-kitchen 0.2.40), so merged fixes arrive on sync — only OPEN items need
tracking. The tracked set with URLs, symptoms, and statuses (verified
2026-10-30; all states below were directly fetched from the issue/PR except
issue #11930, whose OPEN state is from search metadata only and was not directly
fetched — treat as unverified until the first sync re-check):

| Issue/PR | Symptom (one line) | Status | Relevance to this fork |
| --- | --- | --- | --- |
| [#16150](https://github.com/Comfy-Org/ComfyUI/issues/16150) | MiniMax H3 VRAM climbs to the limit / CUDA OOM on ≥0.35 dev with the aimdo compiler; partial fixes landed, reports continue through 2026-10-17; also documents a torch 2.14-vs-2.12 ~4x s/it regression on H3 | **OPEN** | **High.** H3/Director is this instance's first-class default video tier (`epic-video-generation.md`), and the fork's venv runs torch 2.14.1 (ROCm build — the cited A/B was CUDA, mechanism untested here [INFERENCE: worth a local A/B]) |
| [#16144](https://github.com/Comfy-Org/ComfyUI/issues/16144) + follow-ups [comfy-aimdo#129](https://github.com/Comfy-Org/comfy-aimdo/issues/129) / [PR#130](https://github.com/Comfy-Org/comfy-aimdo/pull/130) | H3 + sparse-attention + aimdo compiler: graph-breaks climb mid-run → fragmentation OOM; main path fixed by [PR#16148](https://github.com/Comfy-Org/ComfyUI/pull/16148), residual `vsa_rope_freqs` allocation path + early-free "rogue" poisoning tracked in the aimdo repo | CLOSED main / **OPEN follow-ups** (#129 verified OPEN 2026-10-30; analysis targets aimdo 0.5.6) | **High.** Same default tier; fork runs aimdo 0.6.0 (newer than all reports — status on 0.6.0 unknown [INFERENCE]); the aimdo-repo items are the live tracking targets |
| [#10475](https://github.com/Comfy-Org/ComfyUI/issues/10475) | RAM never returns to baseline after runs; root-caused in-thread to **glibc allocator retention** (RSS ~25 GB with zero live tensors); `malloc_trim(0)` / `MALLOC_TRIM_THRESHOLD_` drops RSS to ~3.6 GB; `soft_empty_cache` only trims GPU, never CPU | **OPEN** | **High.** Linux long-session exactly this fork's shape; pure-host mitigation exists (env var) with no ComfyUI fix merged yet |
| [#14719](https://github.com/Comfy-Org/ComfyUI/issues/14719) | Repeated LTX 2.3 runs hard-freeze the host after N videos; evidence points at comfy-kitchen CUDA kernels + async offloading; mitigations `ck.registry.disable("cuda")` and `--disable-pinned-memory` | **OPEN** | **Medium-high.** LTX is a planned speed tier and the fork pins comfy-kitchen 0.2.40; reports span Windows+CachyOS Linux |
| [PR#15456](https://github.com/Comfy-Org/ComfyUI/pull/15456) | Frees other models' memory before retrying tiled VAE decode (H3 OOM-adjacent) | **OPEN** | Watch; would land on pull if merged |
| [#11930](https://github.com/Comfy-Org/ComfyUI/issues/11930) | Feature: LRU cap on cached models with automatic unloading | **OPEN** (search-metadata only — unverified) | Product-level mitigation direction for long sessions; not a bug |

Merged-fixed exemplars (arrive on pull — cite, don't track): [PR#16148](https://github.com/Comfy-Org/ComfyUI/pull/16148) (fixed the #16144 OOM class); [commit 62b3c94](https://github.com/Comfy-Org/ComfyUI/commit/62b3c94bd45154f6486c7abf1b9efcacee96ea69) (fixed the MiniMax H3 attention VRAM peak, [#15482](https://github.com/Comfy-Org/ComfyUI/issues/15482) closed); [commit 95ca2e5](https://github.com/comfyanonymous/ComfyUI/commit/95ca2e56c82c1c714dba685bd81ebf3f7baf8efa) ("WAN2.2: Fix cache VRAM leak on error"); [#14703](https://github.com/Comfy-Org/ComfyUI/issues/14703) (closed — RAM growth traced to third-party cleanup/patch nodes; caution: no `VRAM cleanup`-style packs in the manifest).

**Acceptance Criteria:**
- [ ] The tracked set (2-4 primary + watch-rows) is recorded with URLs,
      symptom one-liners, and statuses in the ticket body, with each status'
      verification date noted (as of 2026-10-30 all but #11930 were directly
      fetched; #11930 was search-metadata only).
- [ ] Sync checklist: on each fork pull, re-check statuses; note which
      landed fixes the pull brought; re-test the operator symptoms if any
      tracked item closed.
- [ ] Symptom tells documented: RSS ratchet across runs (restart-only cure),
      stepwise VRAM climb to OOM on H3, degrading step time, climbing
      `graph breaks:` log lines.
- [ ] Escape hatches documented against `comfy/cli_args.py`:
      `--disable-comfy-compiler`, `--disable-dynamic-vram`, `--vram-headroom`,
      `--disable-pinned-memory`.
- [ ] `POST /free {unload_models, free_memory}` documented as the
      programmatic unload (server.py:1294-1303), including that it does not
      trim glibc RSS on Linux (#10475) — plus the `MALLOC_TRIM_THRESHOLD_`
      env mitigation as a host-side option to evaluate, never auto-applied.
