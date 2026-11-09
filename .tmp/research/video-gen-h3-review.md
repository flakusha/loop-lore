# H3 Director adoption review (video-gen)

Date: 2026-11-09. Source: `../comfyui/custom_nodes/comfyui-minimaxh3-director/`
(read-only). loop-lore side: `src/generation/video-engine.ts` (167 lines,
single-clip ComfyUI failover), `src/generation/video-gen-route.ts` (339 lines,
submit-202 + poll-status), `src/generation/video-jobs.ts` (in-memory
pending/done/failed store). Example workflows reviewed by NAME ONLY (10 .json
files, listed in §1); contents never opened per directive.

## 1. What the pack is

ComfyUI node pack: plan a video of any length as ~10 s render parts on the
MiniMax H3 native loop, join into one video with sound. Two generations ship
side by side:

- Legacy (`minimax_director.py` 762L, `minimax_plan.py` 1939L,
  `minimax_media.py` 1316L, `minimax_core.py`, `minimax_refprep.py`,
  `minimax_preview*.py`, `minimax_enhance.py` 586L, `minimax_retake.py`,
  `minimax_lastframe.py`, `js/minimax_director.js`): WYSIWYG timeline
  front-end forked from LTX Director (GPL-3.0; 93% of the editor file still
  upstream code, per CONTRIBUTING.md). All timeline interpretation lives in
  `minimax_plan.py` so the live prompt preview and the chain node cannot drift.
- NG (`ng/`: 15 context/director/chunk/render/studio/provider/connector/
  product/output/preview/AI/control/storyboard/still/guide node groups —
  exactly the list in `ng/nodes/__init__.py`; `ng/core/` 51 modules;
  `ng/adapters/` 40 ComfyUI-facing modules; `ng/nodes/` thin V3 wrappers;
  `js/ng/` 70+ panels): context cards (Image/Video/Audio/Text), Context
  Connector, Studio (the Director node's face), Render Sequence (native
  sampling), Collect/Output. Core imports nothing from ComfyUI by rule.
- Skill/docs: `SKILL.md` (install/models/9-workflow table/symptom table),
  `GUIDE.md` (1705 lines, per-workflow chapters), `docs/NG*.md`,
  `docs/NG-validation.md` (664L execution/signal checks), `docs/paper/`,
  `docs/legacy-director.md`. Tests: `test_plan.py` + `test_node.py` legacy;
  `tests/ng/` ~115 `test_*.py` suites + `run_all.py`/`run_tests.py` runners;
  `tests/ng/regressions/` ~90 files (~55 `bug_*.py` numbered 033–095 with
  duplicate 090/091 numbers, ~26 `bug_*.mjs`/timeline/audio suites);
  `tests/ng/js/` JS checks (there is no `tests/js/`). Example workflows
  (names only, 10 `.json` + thumbnails): 1 Text to video, 2 Characters and
  voice, 3 Music video, 4 Shots from pictures, 5 Pictures, 6 Storyboard,
  7 Control video, 8 Inpaint, 9 Custom sampling, Legacy.

SKILL.md/GUIDE.md claims spot-checked against the tree: sampled symptom rows
map to real subsystems (turbo-LoRA settings, Missing Models panel,
control-patch slots, Ollama provider), and the 9-workflow table names the 9
numbered `example_workflows/` files (plus Legacy). No doc-only feature found
in the sampled chapters.

## 2. Adoption mapping (module -> capability -> loop-lore gap)

loop-lore today generates ONE clip per request (failover across providers,
in-memory job, 202-pending/poll). It has no notion of shots, parts,
continuity, or re-useable media. Candidates, lazy order:

1. `ng/core/chunks.py` + `continuation.py` + `ng/adapters/continuation_*.py`
   -> multi-part assembly (17k+5 grid arithmetic, head/pin windows 5/22/39/56,
   head cut off after sampling). Fills: >15 s video today is impossible
   (H3 trained max 360 frames); chunk planning is pure arithmetic, GPU-free,
   the cheapest portable piece.
2. `minimax_plan.py` (legacy) / `ng/core/compile.py` + `part_prompt.py` +
   `shot_document.py` -> shot-to-part prompt compiler with `CompiledChunk`
   (mode/prompt/refs/issues/key/source schema-versioned). Fills: prompt-per-part
   provenance ("Made from") loop-lore has no per-clip prompt record.
3. `ng/core/issues.py` + `limits.py` -> "nothing dropped without an Issue"
   warning type + model-card caps (9 img / 3 vid / 3 aud / 12 files,
   2-15 s clips). Fills: today's engine fails late (provider 500); caps+issues
   give a pre-dispatch validation gate for the route.
4. `minimax_retake.py` (`retake_info`-driven head/middle/tail splice at 24 fps)
   -> partial re-render. Fills: today's failed job re-renders the whole clip;
   retake scoping needs only start/end + base frames.
5. `minimax_preview_runtime.py` + `minimax_preview.py` (TAEHV OUTER_SAMPLE
   wrapper, bounded overhead %, jpeg transport) -> live progress. Fills: poll
   endpoint reports pending/done only; preview frames would ride the existing
   job id with no schema change.
6. `minimax_enhance.py` (VLM writes `global_prompt`; `clean_prompt()` strips
   section labels/numbering collisions — note the module docstring still says
   `_clean()`, which does not exist; own exhibit of fork drift) +
   `ng/core/assist.py` + `system_prompts.py`
   -> prompt assistance that cannot corrupt the compiled structure. Fills:
   route takes raw prompt or `{{variables}}` template; no expansion/validation
   layer. Adopt LAST — needs provider plumbing.

Not adopting: `minimax_media.py` workspace/uploads, `js/` Studio/cards (ComfyUI
graph UI has no loop-lore counterpart), storyboard/picture-editor/SAM3/Qwen
tooling, turbo profiles, control-video lane — all ComfyUI-graph-bound.

## 3. Hard-fork verdict: KEEP THE HARD FORK

The pack at `../comfyui` is already a hard fork of
`seesee75-commits/ComfyUI-MiniMaxH3-Director` (remote is
`flakusha/ComfyUI-MiniMaxH3-Director`, no upstream remote; CHANGELOG is
117 KB of local defect history). A soft patchset is infeasible — defect
classes with file evidence:

1. Cross-cutting semantic fixes, not hunks. Patches 0006-0013 + Unreleased
   CHANGELOG entries each span backend+frontend+tests: whisper discovery
   (`models/whisper` via `folder_paths` + safetensors-bytes sniffing),
   audio-lock encode-once-per-part (sampler-start re-decode froze RX 7900 XTX,
   SDMA timeouts), lyric `[mm:ss]` stamps through three consumers (card ->
   planner -> compiler), cancel across queued prompts AND plain-HTTP panel
   routes (`client_interruptible` transport watch + InterruptProcessingException),
   `duration_seconds` socket + `length_seconds` output. None is backportable
   as a stable hunk; each re-architects data flow.
2. Bug-tail density. `tests/ng/regressions/` holds ~90 files (~55 `bug_*.py`
   repros numbered 033–095: empty-context-id crashes bug_047-056, split/owner
   binding bug_087-089, trim-window float() crash, schema-version-2
   audio-model override drop). Upstream velocity cannot absorb this tail as
   patches; the fork's test suite IS the specification.
3. Co-evolved contracts. `CompiledChunk`/`ContinuityPlan`/`Issue` all carry
   `SCHEMA_VERSION`; panel/route version stamps (v2->v3 migration dropped the
   Audio model override) and `prompt_key` validity scoping mean backend and
   `js/ng/` must move in lockstep — a patchset against upstream's files would
   rot on every upstream JS edit.
4. Divergent lineage already. NG (51 core + 40 adapters + 15 node groups +
   70+ `js/ng/` panels) does not exist upstream in this shape; Legacy editor
   is a GPL-3.0 fork kept at 93% upstream-identical deliberately for
   side-by-side install. There is no upstream base to patch against — the
   fork IS the base.
5. Environment churn baked in: `.ruff_cache/`, `.tmp/` (repro scripts,
   ngtest.log), `__pycache__/` committed-adjacent, `docs/NG-validation.md`
   references local `_notes/` + external Windows paths. A patchset would drag
   this along; a fork owns it.

Own going forward: chunk/continuation arithmetic, compile+issues contracts,
retake splice, TAEHV preview transport, enhance `clean_prompt()` guard. Leave:
Studio/cards JS, media workspace, storyboard/tooling JS, turbo profiles.

## 4. Soft-fork contrast (parent `../comfyui`)

Parent is a genuine soft fork: `git remote -v` shows
`origin git@github.com:flakusha/comfyui.git` + `upstream
https://github.com/Comfy-Org/ComfyUI.git`, and local delta is a patch stack
in `custom_nodes_patches/` (13 numbered patches for h3-director alone:
0001 timeout .. 0013 locked-audio, plus per-node dirs for was-suite,
ClipProj, llama_swap, DaSiWa, easy-use, H3-Multishot). Patches apply at
install (per commit titles: `patches_base` known-good pin); upstream stays
mergeable. That model works because the parent's delta is small, hunk-stable,
and upstream-shaped. h3-director's delta is the opposite: architectural,
cross-layer, test-defined. Shallow `custom_nodes/` listing confirms: ~20
sibling packs coexist untouched; only the director needed a fork.

## 5. Open questions

- Which candidate first: chunk assembly (needs ComfyUI queue access from
  loop-lore — new provider kind?) or issues/limits gate (pure, no provider
  change)?
- `video-jobs.ts` is in-memory; multi-part jobs need durable part state
  (resume keys exist in NG — `adapters/resume.py` — worth porting?).
- GPL-3.0 inheritance: NG core imports nothing from ComfyUI, but porting
  `chunks.py`/`compile.py` logic into TS still derives from GPL code —
  license posture needs a decision before code moves.
