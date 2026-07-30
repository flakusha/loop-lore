# Image Editing Models: Local Inference Research

**Date:** 2026-07-28
**Purpose:** Model recommendations for sd.cpp and ComfyUI image editing integration
**Related Epics:** `epic-comfyui-plugin.md`, `epic-assistant-generation-extensions.md`
**Related Spec:** `docs/spec/integrations/image-generation.md`

---

## Current Project State

### Built

| Component             | File                                              | Status                    |
| --------------------- | ------------------------------------------------- | ------------------------- |
| ComfyUI HTTP client   | `src/generation/providers/comfyui.ts` (234 lines) | submit/poll/WS/download   |
| sd-server integration | `src/generation/image-gen-route.ts` (290 lines)   | 3 API families            |
| Provider registry     | `src/generation/providers/registry.ts`            | failover, circuit breaker |

### Planned (Not Built)

| Component                       | Epic                                      | Status      |
| ------------------------------- | ----------------------------------------- | ----------- |
| ComfyUI workflow templates      | `epic-comfyui-plugin.md`                  | Not started |
| Node discovery (`/object_info`) | `epic-comfyui-plugin.md`                  | Not started |
| `/image` command                | `epic-assistant-generation-extensions.md` | Not started |
| SD adapter for entity creation  | `epic-assistant-generation-extensions.md` | Not started |

### Integration Model

- **ComfyUI is first-class citizen.** Finalized workflow files (JSON) are used as endpoint call contents.
- **sd.cpp in server mode** can also be called via endpoints (OpenAI, WebUI, sdcpp API families).
- Both backends are viable; ComfyUI preferred for complex multi-node pipelines, sd.cpp for simpler single-model calls.

### Existing API Endpoints (sd-server)

| Endpoint                 | Use Case                  | Edit Support                            |
| ------------------------ | ------------------------- | --------------------------------------- |
| `POST /v1/images/edits`  | OpenAI-compatible img2img | mask + prompt                           |
| `POST /sdapi/v1/img2img` | WebUI-compatible img2img  | init_images + mask + denoising_strength |
| `POST /sdcpp/v1/img_gen` | Async job-based           | init_image + mask_image                 |

---

## Practical Testing Results

First-hand testing on RX 7900 XT (20GB VRAM).

### Tested Models

| Model               | Status                 | Notes                                                                                                     |
| ------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------- |
| **Qwen Image Edit** | Works, decent quality  | Slow (VAE + CLIP overhead). Real usage >20GB. Needs layer rotation to avoid OOM.                          |
| **Krea 2 "Edit"**   | Not working in ComfyUI | Samples look good in examples. Edit approach is fine. Needs retesting -- possibly machine-specific issue. |
| **Klein 4B**        | Strange results        | Most of the time produces odd output. Could be setup issue, needs more testing.                           |
| **Klein 9B**        | Strange results        | Same as Klein 4B. Needs more testing.                                                                     |
| **FLUX.1 Kontext**  | Not tested             | Never tried. High priority for next testing round.                                                        |

### Tested Features

| Feature                     | Status        | Notes                                                                                                                                                                                 |
| --------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ControlNet + inpainting** | Minor testing | Manual setup needed most of the time. Low priority -- users can use Krita or similar for inpainting.                                                                                  |
| **IP-Adapter**              | Not tested    | Krea 2 has style reference built in. IP-Adapters are mostly for older but still good SD/SDXL/Illustrious/Noob/Pony models. Not worth deep research if not programmatically definable. |
| **LoRA discovery**          | Works         | Usually works across backends.                                                                                                                                                        |
| **LoRA application**        | Works         | Approach differs by backend. sd.cpp: LoRA inclusion in prompt. ComfyUI API: may need more effort. Results usually good. Application coefficient: 0.1-1.0 (common 0.3-0.7).            |

### Key Takeaways

1. **ComfyUI is the primary integration target.** Workflow JSON files are the API contract.
2. **Qwen Image Edit works but is heavy.** >20GB real usage on 20GB VRAM means layer rotation is mandatory. Consider as secondary option.
3. **Klein models need more investigation.** Strange results could be prompt format, quantization, or setup issues.
4. **FLUX.1 Kontext is untested but promising.** sd.cpp supports it with low VRAM (4-6GB with `--clip-on-cpu`). High priority to test.
5. **Inpainting is low priority for programmatic use.** Users prefer Krita/manual tools. Focus on text-guided editing instead.
6. **LoRA works but needs backend-specific handling.** sd.cpp: prompt injection. ComfyUI: dedicated nodes. Coefficient 0.3-0.7 typical.

---

## Model Recommendations by Use Case

### 1. Image Editing (Primary Use Case)

| Model                    | VRAM (FP16) | VRAM (GGUF Q4)         | Quality   | Speed  | Tested       | sd.cpp | ComfyUI            |
| ------------------------ | ----------- | ---------------------- | --------- | ------ | ------------ | ------ | ------------------ |
| **FLUX.1 Kontext [dev]** | ~24GB       | ~4-6GB (--clip-on-cpu) | Excellent | Medium | No           | Yes    | Yes                |
| **Qwen-Image-Edit-2509** | ~16GB       | ~8GB                   | Very Good | Slow   | Yes          | Yes    | Yes                |
| Krea 2 (Edit LoRAs)      | ~24GB       | ~12GB                  | Very Good | Medium | Partial      | Yes    | Yes (needs retest) |
| Klein 4B/9B              | ~8-16GB     | ~4-8GB                 | Unknown   | Fast   | Yes (issues) | Yes    | Yes                |
| InstructPix2Pix (SDXL)   | ~8GB        | ~4GB                   | Good      | Fast   | No           | Yes    | Yes                |

**Recommendation:** FLUX.1 Kontext for quality (untested but well-supported), Qwen Image Edit as fallback (tested, works but slow/heavy).

### 2. Inpainting (Low Priority)

| Model             | VRAM (FP16) | VRAM (GGUF Q4) | Quality   | Speed  | sd.cpp | ComfyUI |
| ----------------- | ----------- | -------------- | --------- | ------ | ------ | ------- |
| FLUX.1 Fill [dev] | ~24GB       | ~8-12GB        | Excellent | Medium | Yes    | Yes     |
| SDXL Inpainting   | ~8GB        | ~4GB           | Very Good | Medium | Yes    | Yes     |
| SD 1.5 Inpainting | ~4GB        | ~2GB           | Good      | Fast   | Yes    | Yes     |

**Recommendation:** Low priority for programmatic integration. Users prefer manual tools (Krita). If needed, SDXL Inpainting for speed, FLUX.1 Fill for quality.

### 3. ControlNet (Low Priority)

| Model                     | VRAM | Use Case                           | sd.cpp | ComfyUI |
| ------------------------- | ---- | ---------------------------------- | ------ | ------- |
| ControlNet Union (SDXL)   | ~8GB | Multi-control (canny, depth, pose) | Yes    | Yes     |
| ControlNet Canny (SD 1.5) | ~4GB | Edge-guided generation             | Yes    | Yes     |

**Recommendation:** Low priority. Manual setup needed. Users can handle this in ComfyUI directly.

### 4. Upscaling

| Model       | VRAM | Scale | sd.cpp | ComfyUI |
| ----------- | ---- | ----- | ------ | ------- |
| ESRGAN (4x) | ~2GB | 4x    | Yes    | Yes     |
| RealESRGAN  | ~2GB | 4x    | Yes    | Yes     |

**Recommendation:** ESRGAN/RealESRGAN for fast upscaling. Already supported in sd.cpp via `--esrgan-path`.

### 5. Style Transfer

| Model                    | VRAM  | Approach                 | Notes                                       |
| ------------------------ | ----- | ------------------------ | ------------------------------------------- |
| Krea 2 Style Reference   | ~24GB | Reference image to style | Built into Krea 2, not yet tested           |
| IP-Adapter (SD 1.5/SDXL) | ~8GB  | Reference image to style | For older models, not programmable priority |

**Recommendation:** Krea 2 style reference if it works. IP-Adapter only for legacy SD/SDXL workflows.

---

## LoRA Integration

### How LoRA Works Across Backends

| Backend     | LoRA Loading                         | Application           | Coefficient Range         |
| ----------- | ------------------------------------ | --------------------- | ------------------------- |
| **sd.cpp**  | Prompt injection (`<lora:name:0.5>`) | In prompt string      | 0.1-1.0 (typical 0.3-0.7) |
| **ComfyUI** | Dedicated node (`LoraLoader`)        | Node in workflow JSON | 0.1-1.0 (typical 0.3-0.7) |

### LoRA Discovery

Both backends support LoRA discovery:

- **sd.cpp:** `GET /sdapi/v1/loras` endpoint
- **ComfyUI:** Read from `models/loras/` directory, or use `/object_info` to discover loaded LoRAs

### LoRA Application Notes

- Results are usually good across both backends
- Coefficient 0.3-0.7 is the sweet spot for most LoRAs
- Lower values (0.1-0.3) for subtle style changes
- Higher values (0.7-1.0) for strong effect but risk artifacts
- Different LoRA architectures (SD1.5, SDXL, FLUX) are NOT cross-compatible

---

## VRAM Budget Summary (RX 7900 XT = 20GB)

| Scenario         | Model Stack                           | VRAM Usage |
| ---------------- | ------------------------------------- | ---------- |
| **Conservative** | Qwen Image Edit (GGUF Q4) + ESRGAN    | ~12GB      |
| **Balanced**     | FLUX.1 Kontext (GGUF Q8) + ESRGAN     | ~16GB      |
| **Maximum**      | FLUX.1 Kontext + FLUX.1 Fill + ESRGAN | ~20GB      |

**Note:** Qwen Image Edit requires layer rotation in practice (>20GB real usage). FLUX.1 Kontext with `--clip-on-cpu` is more VRAM-efficient.

---

## Implementation Guidance

### ComfyUI Integration (Primary)

ComfyUI workflows are JSON files that can be submitted via the existing HTTP client. The `epic-comfyui-plugin.md` plans a template system on top of this.

**Key workflows for editing:**

**1. Instruction-Based Editing (FLUX.1 Kontext)**

```
LoadImage -> FLUXKontextSampler -> VAEDecode -> SaveImage
```

Nodes: `LoadImage`, `FLUXKontextSampler`, `VAEDecode`, `SaveImage`

**2. Qwen Image Edit**

```
LoadImage -> QwenImageEdit -> SaveImage
```

Nodes: `LoadImage`, `QwenImageEdit`, `SaveImage`

**3. LoRA Application (ComfyUI)**

```
LoadImage -> LoraLoader -> KSampler -> VAEDecode -> SaveImage
```

Nodes: `LoadImage`, `LoraLoader` (with strength_model/strength_clip params), `KSampler`, `VAEDecode`, `SaveImage`

### sd.cpp Integration (Secondary)

sd-server supports editing via existing API endpoints. Model loaded at startup via `--model /path/to/model.gguf`.

**LoRA in sd.cpp:**

```bash
# Include LoRA in prompt
sd-cli -p "a landscape <lora:my_lora:0.5>" --diffusion-model model.gguf
```

**Image edit via WebUI API:**

```bash
curl -X POST http://localhost:9000/sdapi/v1/img2img \
  -H "Content-Type: application/json" \
  -d '{
    "init_images": ["<base64>"],
    "prompt": "edited result <lora:style_lora:0.5>",
    "denoising_strength": 0.6,
    "steps": 25,
    "cfg_scale": 7.0
  }'
```

### Model Download Locations

| Model                     | Source                                             | Size                      |
| ------------------------- | -------------------------------------------------- | ------------------------- |
| FLUX.1 Kontext [dev] GGUF | `QuantStack/FLUX.1-Kontext-dev-GGUF`               | ~4-15GB (varies by quant) |
| Qwen-Image-Edit-2509 GGUF | `QuantStack/Qwen-Image-Edit-2509-GGUF`             | ~8GB                      |
| FLUX.1 Fill [dev] GGUF    | `city96/FLUX.1-Fill-dev-gguf`                      | ~8-12GB                   |
| SDXL Inpainting           | `diffusers/stable-diffusion-xl-1.0-inpainting-0.1` | ~6.5GB                    |
| ESRGAN                    | `xinntao/Real-ESRGAN`                              | ~64MB                     |

---

## sd.cpp Image Editing Details

### FLUX.1 Kontext [dev]

**VRAM:** 4-6GB (with `--clip-on-cpu`), 12-15GB (full)
**Preset:** `flux_kontext`
**VLM:** No (reference image passed directly to DiT via VAE)

**CLI Example:**

```bash
sd-cli -r reference.png \
  --diffusion-model flux1-kontext-dev-q8_0.gguf \
  --vae ae.sft \
  --clip_l clip_l.safetensors \
  --t5xxl t5xxl_fp16.safetensors \
  -p "change text to new text" \
  --cfg-scale 1.0 \
  --sampling-method euler \
  --clip-on-cpu
```

### Qwen Image Edit

**VRAM:** ~16GB FP16, ~8GB GGUF Q4 (but >20GB real usage in practice)
**Preset:** `qwen` or `qwen_layered`
**VLM:** Yes (Qwen2.5-VL-7B)
**Warning:** Requires layer rotation to avoid OOM on 20GB GPU.

### Reference Image Args (`--ref-image-args`)

| Preset              | VLM | RoPE Index | Use Case                   |
| ------------------- | --- | ---------- | -------------------------- |
| `flux_kontext`      | No  | fixed      | FLUX.1 Kontext editing     |
| `qwen`              | Yes | increase   | Qwen Image Edit            |
| `qwen_layered`      | Yes | decrease   | Qwen layered editing       |
| `flux2`             | Yes | increase   | FLUX.2 models              |
| `krea2_ostris_edit` | Yes | increase   | Krea2 community edit LoRAs |

---

## Recommendations Summary

### Implementation Priority (Revised)

1. **Phase 1:** Test FLUX.1 Kontext in ComfyUI (highest potential, untested)
2. **Phase 2:** ComfyUI workflow templates for text-guided editing (Kontext, Qwen)
3. **Phase 3:** LoRA integration in ComfyUI workflows (LoraLoader node)
4. **Phase 4:** `/image edit` command with reference image support
5. **Phase 5:** Inpainting/ControlNet (low priority, manual tools sufficient)

### For loop-lore Integration

1. **Text-guided editing (primary):** FLUX.1 Kontext via ComfyUI workflow
2. **Style transfer:** Krea 2 style reference (if retesting succeeds) or LoRA-based
3. **Inpainting:** Low priority -- users prefer Krita/manual tools
4. **Upscaling:** ESRGAN via sd-server (fast, low VRAM)
5. **LoRA:** Both backends support it; coefficient 0.3-0.7 typical

### Open Questions

1. **FLUX.1 Kontext testing:** Need to test in ComfyUI with GGUF weights
2. **Krea 2 retest:** Why does it fail in ComfyUI? Machine-specific or model issue?
3. **Klein models:** Are strange results from quantization, prompt format, or setup?
4. **LoRA in ComfyUI API:** How does the LoraLoader node map to workflow JSON parameters?
5. **Qwen layer rotation:** Can this be automated in the ComfyUI workflow?
