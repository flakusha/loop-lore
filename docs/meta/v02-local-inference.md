# v0.2 — Local Inference Integrations (Epic 18)

Derived, actionable plan for loop-lore's local / remote inference features.
Consolidates the applicable paragraphs from:

- `docs/research/comfyui-local-inference.md` (§7 Integration Architecture)
- `docs/research/local-remote-inference-uis.md` (§9.1–§9.5, §9.5 caption×metadata, §11 Priority)

Research docs remain the source of inspiration; this file is the implementation
contract referenced by `docs/meta/plan.md` Epic 18.

---

## Scope (priority tier: highest)

Per established priority order — chat > character > world > locations >
gallery > **local integrations** — this epic is the last of the highest-priority
group. It covers: ComfyUI plugin, llama-swap LLM proxy, stable-diffusion.cpp,
gallery metadata enrichment, chat-driven generation, and the security baseline
for touching remote URLs.

---

## 18.1 ComfyUI Plugin (Core Feature)

| Task | Notes | Source |
|------|-------|--------|
| Canonical HTTP+WS client | `POST /prompt`, `GET /history/{id}`, `POST /upload/image`, `GET /view`, `ws://host/ws?clientId=`. No custom protocols. | comfyui §2, local-remote §4.1 |
| Workflow template manager | JSON templates with placeholder substitution (`{{seed}}`, `{{prompt}}`). Stored as assets, linked to character/world. | comfyui §7.1, local-remote §6.2 |
| **Workflow tag composition** | Tag taxonomy: `kind: character\|item\|monster\|location`, `modality: image\|video`. UI/assistant picks the right template without hardcoding. | local-remote §9.1 (refinement) |
| **LoRA selection** | Inline into prompt (`<lora:name:weight>`) OR inject as graph node. Surface available LoRAs (from ComfyUI `/object_info` or managed list) for per-gen composition. | local-remote §9.1 (sd.cpp-webui) |
| Image vs video params | Video needs temporal params (frames, FPS, motion buckets), more VRAM, longer cold start. `modality` drives form fields + backend choice. | local-remote §9.1 |
| Config-driven form generation | Declarative control→node binding (CozyUI/ViewComfy style). | local-remote §9.1 |
| SSE streaming + replay buffer | For reconnect resilience (comfy-chatbot `_JobChannel` pattern). | local-remote §6.3, §9.1 |
| Asset pipeline integration | download → store (`src/assets`) → link via `asset_links` → render (`message.extra.image`). | comfyui §7.1, local-remote §6.4 |
| Chat-driven generation | Intent detection (verb+noun) + silent background renders (Spellcaster pattern). | local-remote §8.1, §9.1 |

## 18.2 llama-swap / stable-diffusion.cpp (Internal)

| Task | Notes | Source |
|------|-------|--------|
| llama-swap proxy | OpenAI-compatible API, no binary deps. Multi-model, lazy load, auto-unload idle. | comfyui §5 |
| sd.cpp via llama-swap SDAPI | Or direct SDAPI client (`/sdapi/v1/txt2img`). | comfyui §6, local-remote §7 |
| **sd-server default** | Long-running server hosts model, keeps VRAM cache, supports batches, **no load-unload loop**. Preferred for interactive + batch. Fall back to `sd-cli` only for one-off/offline. | local-remote §9.2 (refinement) |
| Metadata extraction | Parse generation params into asset metadata. | local-remote §9.2 |

## 18.3 Gallery Metadata Enrichment

| Task | Notes | Source |
|------|-------|--------|
| PNG dual-chunk metadata | A1111 `tEXt "parameters"` + extended `iTXt` (full workflow JSON, hashes, timing). | local-remote §7.1 (Image MetaHub) |
| Faceted search | Model / LoRA / sampler / rating tri-state filters. Metadata-driven, not AI. | local-remote §7.2–§7.3 (SmartGallery) |
| **Caption × metadata → chat context** | Caption becomes character memory / world description; params enable re-roll/tweak. | local-remote §9.5 (feedback #5) |
| Semantic search (differentiator) | LLM-native embedding search on top of faceted. | local-remote §9.5 |

## 18.4 Security Baseline (adopt when inference ships)

> Note: security was NOT deeply visited during MVP dev — these are the baseline.

| Control | Source |
|---------|--------|
| SSRF allowlist (block file://, AWS metadata, RFC1918, link-local) on remote URLs | local-remote §9.3 (comfy-workflow-studio) |
| Upload size + MIME caps | local-remote §9.3 |
| Path-traversal confinement (`is_relative_to` base dir) on workflow resolution | local-remote §9.3 (comfy-chatbot) |
| Atomic persistence (tempfile → fsync → os.replace) | local-remote §9.3 |
| WebSocket ping/pong heartbeat | local-remote §9.3 |

---

## Disposition

- **MVP-actionable** — drives v0.2 Epic 18.
- Source research (`comfyui-local-inference.md`, `local-remote-inference-uis.md`)
  stay as inspiration; prune once Epic 18 lands in `src/`.
